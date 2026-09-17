// screens/ClosetScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Modal,
  ScrollView,
  RefreshControl,
  Platform,
  Pressable,
  Linking,
  TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../context/ThemeContext';
import { uploadImageToStorage } from '../firebase/uploadImageToStorage';
import {
  addClothingItem, getUserCloset,
  getOutfitCollections, createOutfitCollection,
  getSavedOutfits,
} from '../firebase/firestoreService';
import { analyzeClothingImage } from '../services/aiImageAnalysis';
import { removeBackgroundAndUpload } from '../services/backgroundRemovalService';
import { analyzeGarmentPhoto } from '../services/garmentCropService';

import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { Asset } from 'expo-asset';
import { CATALOG, ITEM_IMAGES } from '../data/clothingCatalog';
import CATALOG_PREVIEWS from '../data/catalogPreviewImages';

const CACHE_TTL_MS = 1000 * 60 * 10; // 10 minutes

const CATEGORIES = [
  { key: 'unassigned', label: 'Your Items' },
  { key: 'tops', label: 'Tops' },
  { key: 'bottoms', label: 'Bottoms' },
  { key: 'outerwear', label: 'Outerwear' },
  { key: 'one_piece', label: 'One Piece' },
  { key: 'footwear', label: 'Footwear' },
  { key: 'accessories', label: 'Accessories' },
  { key: 'undergarments', label: 'Undergarments' },
];

function withTimeout(promise, ms, label = 'operation') {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

export default function ClosetScreen({ navigation }) {
  const { user } = useAuth();
  const c = useColors();

  const [closetItems, setClosetItems] = useState([]);
  const [loadingCloset, setLoadingCloset] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [pickerAssets, setPickerAssets] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemColor, setItemColor] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [detectedMetadata, setDetectedMetadata] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const [searchText, setSearchText] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [movingItem, setMovingItem] = useState(null);

  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogCategory, setCatalogCategory] = useState(CATALOG[0].key);
  const [catalogSelected, setCatalogSelected] = useState(new Set());

  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);

  const [collections, setCollections] = useState([]);
  const [savedOutfitMap, setSavedOutfitMap] = useState({});
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [savingCollection, setSavingCollection] = useState(false);

  const [hiddenSections, setHiddenSections] = useState(new Set());
  const hiddenSectionsKey = user?.uid ? `hidden_sections_${user.uid}` : null;

  useEffect(() => {
    if (!hiddenSectionsKey) return;
    AsyncStorage.getItem(hiddenSectionsKey).then((val) => {
      if (val) setHiddenSections(new Set(JSON.parse(val)));
    });
  }, [hiddenSectionsKey]);

  const hideSection = useCallback((key) => {
    setHiddenSections((prev) => {
      const next = new Set(prev);
      next.add(key);
      if (hiddenSectionsKey) AsyncStorage.setItem(hiddenSectionsKey, JSON.stringify([...next]));
      return next;
    });
  }, [hiddenSectionsKey]);

  const restoreAllSections = useCallback(() => {
    setHiddenSections(new Set());
    if (hiddenSectionsKey) AsyncStorage.removeItem(hiddenSectionsKey);
  }, [hiddenSectionsKey]);

  const setUploadingSafe = (v) => {
    uploadingRef.current = v;
    setUploading(v);
  };

  const cacheKey = useMemo(() => (user?.uid ? `closet_cache_${user.uid}` : null), [user?.uid]);

  const loadFromCache = useCallback(async () => {
    if (!cacheKey) return false;
    try {
      const raw = await AsyncStorage.getItem(cacheKey);
      if (!raw) return false;

      const parsed = JSON.parse(raw);
      const { items, ts } = parsed || {};
      if (!Array.isArray(items) || !ts) return false;

      const isFresh = Date.now() - ts < CACHE_TTL_MS;
      setClosetItems(items);
      setLoadingCloset(false);
      return isFresh;
    } catch {
      return false;
    }
  }, [cacheKey]);

  const saveToCache = useCallback(
    async (items) => {
      if (!cacheKey) return;
      try {
        await AsyncStorage.setItem(cacheKey, JSON.stringify({ items, ts: Date.now() }));
      } catch {
        // ignore
      }
    },
    [cacheKey]
  );

  const loadCloset = useCallback(
    async ({ silent = false } = {}) => {
      if (!user?.uid) return;

      if (!silent && closetItems.length === 0) setLoadingCloset(true);

      try {
        const [items, cols, saved] = await Promise.all([
          getUserCloset(user.uid),
          getOutfitCollections(user.uid).catch(() => []),
          getSavedOutfits(user.uid).catch(() => []),
        ]);
        const oMap = {};
        (saved || []).forEach((o) => { oMap[o.id] = o; });
        setSavedOutfitMap(oMap);
        const normalized = (items || []).map((it) => ({
          ...it,
          category: it.category || 'unassigned',
        }));
        setClosetItems(normalized);
        setCollections(cols);
        setLoadError('');
        setLoadingCloset(false);
        await saveToCache(normalized);
      } catch (err) {
        console.error('Error loading closet:', err);
        setLoadError(err?.message || 'Could not load your closet right now.');
        setLoadingCloset(false);
        if (!silent) Alert.alert('Error', err?.message || 'Failed to load your closet items.');
      }
    },
    [user?.uid, closetItems.length, saveToCache]
  );

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      setLoadingCloset(true);
      const cacheFresh = await loadFromCache();
      await loadCloset({ silent: cacheFresh });
    })();
  }, [user?.uid, loadFromCache, loadCloset]);

  const onRefresh = useCallback(async () => {
    if (!user?.uid) return;
    setRefreshing(true);
    await loadCloset({ silent: true });
    setRefreshing(false);
  }, [user?.uid, loadCloset]);

  const handleCreateCollection = useCallback(async () => {
    const name = newCollectionName.trim();
    if (!name || savingCollection) return;
    setSavingCollection(true);
    try {
      const id = await createOutfitCollection(user.uid, name);
      setCollections((prev) => [{ id, name, outfitIds: [], createdAt: null }, ...prev]);
      setNewCollectionName('');
      setCreatingCollection(false);
    } catch (err) {
      Alert.alert('Could not create collection', err?.message || 'Please try again.');
    } finally {
      setSavingCollection(false);
    }
  }, [newCollectionName, savingCollection, user?.uid]);

  const requestMediaPermissions = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    const { status, accessPrivileges } = permission;

    if (status !== 'granted') {
      Alert.alert('Permission required', 'We need access to your photo library to add items.');
      return false;
    }

    if (Platform.OS === 'ios' && accessPrivileges === 'limited') {
      Alert.alert(
        'Limited Photo Access',
        'ClosetAI can currently access only selected photos. To use your full photo library, allow full access in iOS Settings.',
        [
          { text: 'Continue', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              Linking.openSettings();
            },
          },
        ]
      );
    }

    return true;
  };

  const handleAddFromCatalog = useCallback(async () => {
    if (catalogSelected.size === 0) return;
    setShowCatalog(false);
    setUploadingSafe(true);
    try {
      const created = [];
      for (const key of catalogSelected) {
        const [catKey, itemName] = key.split('::');
        const catSection = CATALOG.find((c) => c.key === catKey);
        const item = catSection?.items.find((i) => i.name === itemName);
        if (!item) continue;

        // Upload the pre-colored PNG (same image shown in catalog picker)
        let imageUrl = null;
        try {
          const previewModule = CATALOG_PREVIEWS[item.name] || ITEM_IMAGES[item.image];
          if (previewModule) {
            const asset = Asset.fromModule(previewModule);
            await asset.downloadAsync();
            if (asset.localUri) {
              imageUrl = await uploadImageToStorage(asset.localUri, {
                folder: 'clothing',
                userId: user.uid,
              });
            }
          }
        } catch (uploadErr) {
          console.warn('Catalog image upload failed, saving without image:', uploadErr.message);
        }

        const docId = await addClothingItem(user.uid, {
          imageUrl,
          category: catKey,
          type: 'unknown',
          name: item.name,
          color: item.color,
          style: '',
        });
        created.push({ id: docId, imageUrl, category: catKey, name: item.name, color: item.color });
      }
      setClosetItems((prev) => [...created, ...prev]);
      await saveToCache([...created, ...closetItems]);
      setCatalogSelected(new Set());
      Alert.alert('Added!', `${created.length} item${created.length !== 1 ? 's' : ''} added to your closet.`);
    } catch (err) {
      Alert.alert('Error', err?.message || 'Could not add items.');
    } finally {
      setUploadingSafe(false);
    }
  }, [catalogSelected, user?.uid, closetItems, saveToCache]);

  const handleAddToClosetPress = async () => {
    if (!user?.uid) {
      Alert.alert('Not logged in', 'Please log in to add items to your closet.');
      return;
    }
    if (uploadingRef.current) {
      Alert.alert('Uploading', 'Please wait for the current upload to finish.');
      return;
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Scan Outfit Photo', 'Upload Single Item', 'Search the Web', 'Browse Generic Catalog', 'Cancel'],
          cancelButtonIndex: 4,
        },
        (index) => {
          if (index === 0) launchOutfitScanner();
          if (index === 1) launchPhotoPicker();
          if (index === 2) navigation.navigate('WebSearch');
          if (index === 3) setShowCatalog(true);
        }
      );
      return;
    }

    Alert.alert('Add to Closet', 'How would you like to add items?', [
      { text: 'Scan Outfit Photo',      onPress: launchOutfitScanner },
      { text: 'Upload Single Item',     onPress: launchPhotoPicker },
      { text: 'Search the Web',         onPress: () => navigation.navigate('WebSearch') },
      { text: 'Browse Generic Catalog', onPress: () => setShowCatalog(true) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const launchOutfitScanner = async () => {
    const ok = await requestMediaPermissions();
    if (!ok) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        allowsEditing: false,
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.length) return;
      navigation.navigate('OutfitScan', { imageUri: result.assets[0].uri });
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to open photo library.');
    }
  };

  const launchPhotoPicker = async () => {
    const ok = await requestMediaPermissions();
    if (!ok) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        selectionLimit: 0,
        quality: 0.85,
        allowsEditing: false,
      });

      if (result.canceled) return;

      const assets = Array.isArray(result.assets) ? result.assets : [];
      if (assets.length === 0) {
        Alert.alert('No images selected', 'Please select at least one image.');
        return;
      }

      console.log('PICKER selected assets:', assets.map((a) => a.uri));
      setPickerAssets(assets);
      setShowPreview(true);
      triggerAnalysis(assets);
    } catch (err) {
      console.error('ImagePicker error:', err);
      Alert.alert('Error', err?.message || 'Failed to open photo library.');
    }
  };

  const triggerAnalysis = useCallback(async (assets) => {
    setAnalyzing(true);
    setDetectedMetadata([]);
    try {
      const results = await Promise.all(
        assets.map((a) => analyzeClothingImage(a.uri).catch(() => null))
      );
      setDetectedMetadata(results);
      if (assets.length === 1 && results[0]) {
        setItemName(results[0].name || '');
        setItemColor(results[0].color || '');
      }
    } catch {
      // silent — user can fill in manually
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const handleCancelPreview = () => {
    setShowPreview(false);
    setPickerAssets([]);
    setItemName('');
    setItemColor('');
    setAnalyzing(false);
    setDetectedMetadata([]);
  };

  const handleConfirmAdd = async () => {
    if (!user?.uid) return;

    const assets = pickerAssets || [];
    if (assets.length === 0) {
      Alert.alert('Nothing to upload', 'Please select images first.');
      return;
    }

    setShowPreview(false);
    setUploadingSafe(true);

    try {
      console.log('CONFIRM ADD pressed', { count: assets.length, uid: user.uid });

      const created = [];
      const rejected = [];

      for (let i = 0; i < assets.length; i++) {
        const rawUri = assets[i]?.uri;
        const { croppedUri, multipleItems } = await analyzeGarmentPhoto(rawUri);

        if (multipleItems) {
          const detected = detectedMetadata[i] || {};
          rejected.push(detected.name || `Photo ${i + 1}`);
          continue;
        }

        const uri = croppedUri;

        const imageUrl = await withTimeout(
          uploadImageToStorage(uri, { folder: 'clothing', userId: user.uid }),
          60_000,
          `upload ${i + 1}/${assets.length}`
        );

        const cutoutUrl = await removeBackgroundAndUpload(uri, user.uid).catch(() => null);

        const detected = detectedMetadata[i] || {};
        const name = assets.length === 1 ? (itemName.trim() || detected.name || '') : (detected.name || '');
        const color = assets.length === 1 ? (itemColor.trim() || detected.color || 'unknown') : (detected.color || 'unknown');
        const category = detected.category || 'unassigned';
        const style = detected.style || '';

        const docId = await withTimeout(
          addClothingItem(user.uid, {
            imageUrl,
            cutoutUrl: cutoutUrl || null,
            category,
            type: 'unknown',
            name,
            color,
            style,
          }),
          60_000,
          `addClothingItem ${i + 1}/${assets.length}`
        );

        created.push({ id: docId, imageUrl, cutoutUrl: cutoutUrl || null, category, name, color, style });
      }

      setClosetItems((prev) => [...created, ...prev]);
      await saveToCache([...created, ...closetItems]);

      setPickerAssets([]);
      setItemName('');
      setItemColor('');
      setDetectedMetadata([]);

      if (rejected.length > 0) {
        const addedMsg = created.length > 0 ? `Added ${created.length} item(s).\n\n` : '';
        Alert.alert(
          'Some photos were skipped',
          `${addedMsg}${rejected.length} photo(s) show multiple clothing items (e.g. a full outfit) and weren't added:\n${rejected.join(', ')}\n\nPlease take separate photos of each item.`
        );
      } else {
        Alert.alert('Success', `Added ${created.length} item(s) to your closet!`);
      }
    } catch (err) {
      console.error('Confirm add error:', err);
      Alert.alert('Upload failed', err?.message || 'Failed to upload items.');
    } finally {
      setUploadingSafe(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return closetItems;
    return closetItems.filter(
      (it) =>
        (it.name || '').toLowerCase().includes(q) ||
        (it.color || '').toLowerCase().includes(q) ||
        (it.category || '').toLowerCase().includes(q)
    );
  }, [closetItems, searchText]);

  const grouped = useMemo(() => {
    const map = {};
    for (const cat of CATEGORIES) map[cat.key] = [];
    for (const it of filteredItems) {
      const key = it.category || 'unassigned';
      if (!map[key]) map[key] = [];
      map[key].push(it);
    }
    return map;
  }, [filteredItems]);

  const updateItemCategory = useCallback(
    async (item, newCategory) => {
      if (!user?.uid) return;
      if (!item?.id || !newCategory) return;
      if ((item.category || 'unassigned') === newCategory) return;

      setClosetItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, category: newCategory } : it))
      );

      try {
        await updateDoc(doc(db, 'closets', item.id), { category: newCategory });
      } catch (err) {
        console.error('update category failed:', err);
        Alert.alert('Error', 'Could not move item. Reloading…');
        await loadCloset({ silent: true });
      }
    },
    [user?.uid, loadCloset]
  );

  const handleDeleteItem = useCallback(
    (item) => {
      if (!item?.id) return;
      Alert.alert('Delete item?', 'Remove this clothing item?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'closets', item.id));
              setClosetItems((prev) => prev.filter((it) => it.id !== item.id));
              await saveToCache(closetItems.filter((it) => it.id !== item.id));
            } catch (err) {
              console.error('delete failed:', err);
              Alert.alert('Error', 'Failed to delete item.');
            }
          },
        },
      ]);
    },
    [closetItems, saveToCache]
  );

  const openMoveItemMenu = useCallback(
    (item) => {
      const moveToCategory = async (targetCategory) => {
        await updateItemCategory(item, targetCategory);
      };

      if (Platform.OS === 'ios') {
        const options = [...CATEGORIES.map((c) => `Move to ${c.label}`), 'Cancel'];
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options,
            cancelButtonIndex: options.length - 1,
          },
          async (index) => {
            if (index === options.length - 1) return;
            const category = CATEGORIES[index];
            if (!category) return;
            await moveToCategory(category.key);
          }
        );
        return;
      }

      Alert.alert(
        'Move item',
        'Choose a section',
        [
          ...CATEGORIES.map((c) => ({
            text: c.label,
            onPress: () => moveToCategory(c.key),
          })),
          { text: 'Cancel', style: 'cancel' },
        ],
        { cancelable: true }
      );
    },
    [updateItemCategory]
  );

  const openEditModal = useCallback((item) => {
    setEditingItem(item);
    setEditName(item.name || '');
    setEditColor(item.color || '');
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingItem?.id) return;
    const updatedName = editName.trim();
    const updatedColor = editColor.trim();
    setClosetItems((prev) =>
      prev.map((it) =>
        it.id === editingItem.id ? { ...it, name: updatedName, color: updatedColor } : it
      )
    );
    setEditingItem(null);
    try {
      await updateDoc(doc(db, 'closets', editingItem.id), {
        name: updatedName,
        color: updatedColor,
      });
    } catch (err) {
      console.error('Edit save failed:', err);
      Alert.alert('Error', 'Could not save changes.');
      await loadCloset({ silent: true });
    }
  }, [editingItem, editName, editColor, loadCloset]);

  const openItemActions = useCallback(
    (item) => {
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Edit details', 'Move to section', 'Delete item', 'Cancel'],
            cancelButtonIndex: 3,
            destructiveButtonIndex: 2,
          },
          (index) => {
            if (index === 0) openEditModal(item);
            if (index === 1) openMoveItemMenu(item);
            if (index === 2) handleDeleteItem(item);
          }
        );
        return;
      }

      Alert.alert('Item actions', 'Choose an action', [
        { text: 'Edit details', onPress: () => openEditModal(item) },
        { text: 'Move to section', onPress: () => openMoveItemMenu(item) },
        { text: 'Delete item', style: 'destructive', onPress: () => handleDeleteItem(item) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [handleDeleteItem, openMoveItemMenu, openEditModal]
  );

  const renderDraggableItem = (item) => {
    return (
      <View key={item.id} style={[styles.itemContainer, { backgroundColor: c.surfaceAlt }]}>
        <Pressable
          style={{ flex: 1 }}
          onPress={editMode ? () => setMovingItem(item) : undefined}
          onLongPress={() => editMode ? setMovingItem(item) : openItemActions(item)}
        >
          {item.imageUrl
            ? <Image source={{ uri: item.imageUrl }} style={styles.itemImage} />
            : <View style={[styles.itemImage, { alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="shirt-outline" size={32} color={c.textMuted} />
              </View>
          }
          {editMode && (
            <View style={styles.editOverlay}>
              <Text style={[styles.itemNameLabel, { color: c.text }]} numberOfLines={1}>
                {item.name || item.category || ''}
              </Text>
            </View>
          )}
        </Pressable>
        {editMode && (
          <Pressable
            style={styles.deleteBadge}
            onPress={() => handleDeleteItem(item)}
            hitSlop={6}
          >
            <Ionicons name="close-circle" size={24} color="#e0374a" />
          </Pressable>
        )}
      </View>
    );
  };

  const CategoryDropZone = ({ categoryKey, title }) => {
    const items = grouped[categoryKey] || [];
    const isEmpty = items.length === 0;

    return (
      <View style={[styles.dropZone, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.sectionTitleRow}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>{title}</Text>
          {isEmpty && (
            <Pressable
              onPress={() => hideSection(categoryKey)}
              hitSlop={10}
              style={styles.hideSectionBtn}
            >
              <Ionicons name="close-circle-outline" size={20} color={c.textMuted} />
            </Pressable>
          )}
        </View>
        <View style={styles.grid}>
          {isEmpty ? (
            <Text style={[styles.emptyInSection, { color: c.textMuted }]}>No items yet</Text>
          ) : (
            items.map(renderDraggableItem)
          )}
        </View>
      </View>
    );
  };

  const screenContent = (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView
        style={styles.sectionList}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        scrollEnabled
        alwaysBounceVertical
        bounces
        showsVerticalScrollIndicator
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.flatListContent}
      >
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: c.text }]}>My Closet</Text>
          {closetItems.length > 0 && (
            <Pressable onPress={() => setEditMode((e) => !e)} hitSlop={8}>
              <Text style={[styles.editToggle, { color: editMode ? '#e0374a' : c.textSecondary }]}>
                {editMode ? 'Done' : 'Edit'}
              </Text>
            </Pressable>
          )}
        </View>
        {editMode && (
          <Text style={[styles.editHint, { color: c.textMuted }]}>
            Tap ✕ to delete · Tap an item to move it to a different section
          </Text>
        )}
        <TouchableOpacity
          style={[styles.addBtn, uploading ? styles.addBtnDisabled : null]}
          onPress={handleAddToClosetPress}
          disabled={uploading}
        >
          {uploading ? (
            <View style={styles.rowCenter}>
              <ActivityIndicator />
              <Text style={styles.addBtnText}>Uploading…</Text>
            </View>
          ) : (
            <Text style={styles.addBtnText}>Add to Closet</Text>
          )}
        </TouchableOpacity>

        <TextInput
          style={[styles.searchInput, { backgroundColor: c.inputBg, borderColor: c.borderStrong, color: c.text }]}
          placeholder="Search by name, color, or category…"
          placeholderTextColor={c.placeholder}
          value={searchText}
          onChangeText={setSearchText}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />

        {loadError ? (
          <View style={[styles.warningBanner, { backgroundColor: c.warningBg, borderColor: c.warningBorder }]}>
            <Text style={[styles.warningText, { color: c.warningText }]}>{loadError}</Text>
          </View>
        ) : null}

        {loadingCloset ? <ActivityIndicator size="large" style={{ marginTop: 20 }} /> : null}

        {/* ── Collections ─────────────────────────────────────────────────── */}
        <View style={styles.collectionsSection}>
          <View style={styles.collectionsTitleRow}>
            <Text style={[styles.collectionsTitle, { color: c.text }]}>My Collections</Text>
            <Pressable
              style={[styles.newCollectionBtn, { borderColor: c.borderStrong }]}
              onPress={() => { setNewCollectionName(''); setCreatingCollection(true); }}
            >
              <Ionicons name="add" size={14} color={c.text} />
              <Text style={[styles.newCollectionLabel, { color: c.text }]}>New</Text>
            </Pressable>
          </View>

          {creatingCollection && (
            <View style={[styles.newCollectionRow, { backgroundColor: c.surface, borderColor: c.border }]}>
              <TextInput
                style={[styles.newCollectionInput, { color: c.text, borderColor: c.borderStrong, backgroundColor: c.inputBg }]}
                placeholder="Collection name…"
                placeholderTextColor={c.placeholder}
                value={newCollectionName}
                onChangeText={setNewCollectionName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreateCollection}
              />
              <Pressable
                style={[styles.createCollectionBtn, { backgroundColor: newCollectionName.trim() && !savingCollection ? '#111' : c.border }]}
                onPress={handleCreateCollection}
                disabled={!newCollectionName.trim() || savingCollection}
              >
                {savingCollection
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.createCollectionBtnText}>Create</Text>}
              </Pressable>
              <Pressable onPress={() => { setCreatingCollection(false); setNewCollectionName(''); }} hitSlop={8}>
                <Ionicons name="close-circle" size={22} color={c.textMuted} />
              </Pressable>
            </View>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.collectionsScroll}>
            {collections.length === 0 && !creatingCollection ? (
              <Pressable
                style={[styles.collectionCardNew, { backgroundColor: c.surface, borderColor: c.border }]}
                onPress={() => { setNewCollectionName(''); setCreatingCollection(true); }}
              >
                <Ionicons name="albums-outline" size={28} color={c.textMuted} />
                <Text style={[styles.collectionCardNewLabel, { color: c.textMuted }]}>Create your first collection</Text>
              </Pressable>
            ) : (
              collections.map((col) => {
                const thumbs = (col.outfitIds || []).slice(0, 4);
                return (
                  <Pressable
                    key={col.id}
                    style={[styles.collectionCard, { backgroundColor: c.surface, borderColor: c.border }]}
                    onPress={() => navigation.navigate('CollectionDetail', { collection: col })}
                  >
                    <View style={styles.collectionGrid}>
                      {[0,1,2,3].map((i) => {
                        const outfit = thumbs[i] ? savedOutfitMap[thumbs[i]] : null;
                        const imgUrl = outfit
                          ? [outfit.top, outfit.onePiece, outfit.bottom, outfit.layer, outfit.shoes]
                              .filter(Boolean).find((it) => it?.imageUrl)?.imageUrl
                          : null;
                        return (
                          <View key={i} style={[styles.collectionThumb, { backgroundColor: c.surfaceAlt }]}>
                            {imgUrl
                              ? <Image source={{ uri: imgUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                              : <Ionicons name="shirt-outline" size={12} color={c.border} />}
                          </View>
                        );
                      })}
                    </View>
                    <Text style={[styles.collectionName, { color: c.text }]} numberOfLines={1}>{col.name}</Text>
                    <Text style={[styles.collectionCount, { color: c.textMuted }]}>
                      {(col.outfitIds || []).length} outfit{(col.outfitIds || []).length !== 1 ? 's' : ''}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>

        {!loadingCloset && closetItems.length === 0 ? (
          <View style={[styles.emptyStateBox, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.emptyStateText, { color: c.textSecondary }]}>Your closet is empty. Tap "Add to Closet" to begin.</Text>
          </View>
        ) : null}

        {CATEGORIES
          .filter((cat) => {
            const hasItems = (grouped[cat.key] || []).length > 0;
            // Always show sections that have items; hide empty ones the user dismissed
            return hasItems || !hiddenSections.has(cat.key);
          })
          .map((cat) => (
            <CategoryDropZone key={cat.key} categoryKey={cat.key} title={cat.label} />
          ))
        }

        {hiddenSections.size > 0 && (
          <Pressable style={styles.restoreSectionsBtn} onPress={restoreAllSections}>
            <Ionicons name="add-circle-outline" size={15} color={c.textMuted} />
            <Text style={[styles.restoreSectionsText, { color: c.textMuted }]}>
              Restore {hiddenSections.size} hidden section{hiddenSections.size !== 1 ? 's' : ''}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Catalog Modal */}
      <Modal visible={showCatalog} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: c.background, flex: 1, marginTop: 60, borderRadius: 20 }]}>
            {/* Header */}
            <View style={[styles.catalogHeader, { borderBottomColor: c.border }]}>
              <Text style={[styles.modalTitle, { color: c.text }]}>Generic Catalog</Text>
              <TouchableOpacity onPress={() => { setShowCatalog(false); setCatalogSelected(new Set()); }}>
                <Text style={[styles.cancelLink, { color: c.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>

            {/* Category tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catalogTabScroll} contentContainerStyle={styles.catalogTabContent}>
              {CATALOG.map((cat) => (
                <Pressable
                  key={cat.key}
                  style={[styles.catalogTab, catalogCategory === cat.key && [styles.catalogTabActive, { borderColor: c.text }]]}
                  onPress={() => setCatalogCategory(cat.key)}
                >
                  <Text style={[styles.catalogTabText, { color: catalogCategory === cat.key ? c.text : c.textMuted }]}>
                    {cat.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Items list */}
            <ScrollView style={styles.catalogItems} contentContainerStyle={{ paddingBottom: 120 }}>
              {(CATALOG.find((cat) => cat.key === catalogCategory)?.items || []).map((item) => {
                const key = `${catalogCategory}::${item.name}`;
                const selected = catalogSelected.has(key);
                return (
                  <Pressable
                    key={key}
                    style={[styles.catalogRow, { borderColor: c.border }, selected && [styles.catalogRowSelected, { borderColor: '#111', backgroundColor: c.surfaceAlt }]]}
                    onPress={() => {
                      setCatalogSelected((prev) => {
                        const next = new Set(prev);
                        next.has(key) ? next.delete(key) : next.add(key);
                        return next;
                      });
                    }}
                  >
                    {/* Pre-colored PNG — exact same image uploaded to closet */}
                    <View style={[styles.catalogImgWrap, {
                      backgroundColor: ['#f5f5f5','#ffffff','#fff','#c0c0c0'].includes(item.hex.toLowerCase()) ? '#2a2a2a' : item.hex + '18',
                      borderRadius: 10,
                    }]}>
                      <Image
                        source={CATALOG_PREVIEWS[item.name] || ITEM_IMAGES[item.image]}
                        style={styles.catalogImg}
                        resizeMode="contain"
                      />
                    </View>
                    <Text style={[styles.catalogItemName, { color: c.text }]}>{item.name}</Text>
                    <View style={[styles.catalogCheck, { borderColor: selected ? '#111' : c.borderStrong, backgroundColor: selected ? '#111' : 'transparent' }]}>
                      {selected && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>✓</Text>}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Add button */}
            <View style={[styles.catalogFooter, { borderTopColor: c.border, backgroundColor: c.background }]}>
              <TouchableOpacity
                style={[styles.catalogAddBtn, catalogSelected.size === 0 && styles.addBtnDisabled]}
                onPress={handleAddFromCatalog}
                disabled={catalogSelected.size === 0}
              >
                <Text style={styles.addBtnText}>
                  {catalogSelected.size === 0 ? 'Select items to add' : `Add ${catalogSelected.size} item${catalogSelected.size !== 1 ? 's' : ''} to Closet`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Move-to-section Modal */}
      <Modal visible={!!movingItem} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: c.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: c.text }]}>Move to section</Text>
              <TouchableOpacity onPress={() => setMovingItem(null)}>
                <Text style={[styles.cancelLink, { color: c.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
            {movingItem?.imageUrl ? (
              <Image source={{ uri: movingItem.imageUrl }} style={styles.moveThumb} resizeMode="contain" />
            ) : null}
            <Text style={[styles.moveItemName, { color: c.textSecondary }]} numberOfLines={1}>
              {movingItem?.name || movingItem?.category || 'Item'}
            </Text>
            <View style={styles.moveSectionGrid}>
              {CATEGORIES.map((cat) => {
                const isCurrent = (movingItem?.category || 'unassigned') === cat.key;
                return (
                  <Pressable
                    key={cat.key}
                    style={[
                      styles.moveSectionTile,
                      { borderColor: isCurrent ? c.text : c.border, backgroundColor: isCurrent ? c.surfaceAlt : 'transparent' },
                    ]}
                    onPress={async () => {
                      const item = movingItem;
                      setMovingItem(null);
                      await updateItemCategory(item, cat.key);
                    }}
                    disabled={isCurrent}
                  >
                    <Text style={[styles.moveSectionLabel, { color: isCurrent ? c.text : c.textSecondary }]}>
                      {cat.label}
                    </Text>
                    {isCurrent && (
                      <Text style={[styles.moveSectionCurrent, { color: c.textMuted }]}>current</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={!!editingItem} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: c.background }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Edit Details</Text>
            {editingItem?.imageUrl ? (
              <Image source={{ uri: editingItem.imageUrl }} style={styles.editThumb} />
            ) : null}
            <View style={styles.metaForm}>
              <TextInput
                style={[styles.metaInput, { backgroundColor: c.inputBg, borderColor: c.borderStrong, color: c.text }]}
                placeholder="Item name (e.g. White linen shirt)"
                placeholderTextColor={c.placeholder}
                value={editName}
                onChangeText={setEditName}
              />
              <TextInput
                style={[styles.metaInput, { backgroundColor: c.inputBg, borderColor: c.borderStrong, color: c.text }]}
                placeholder="Color (e.g. Navy blue)"
                placeholderTextColor={c.placeholder}
                value={editColor}
                onChangeText={setEditColor}
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost, { backgroundColor: c.surfaceAlt }]}
                onPress={() => setEditingItem(null)}
              >
                <Text style={[styles.modalBtnText, styles.modalBtnTextGhost, { color: c.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={handleSaveEdit}
              >
                <Text style={styles.modalBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Preview Modal */}
      <Modal visible={showPreview} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: c.background }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Preview</Text>
            <Text style={[styles.modalSubtitle, { color: c.textSecondary }]}>{pickerAssets.length} image(s) selected</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
              {pickerAssets.map((a, idx) => (
                <Image
                  key={`${a.uri}-${idx}`}
                  source={{ uri: a.uri }}
                  style={styles.previewImage}
                />
              ))}
            </ScrollView>

            {pickerAssets.length === 1 ? (
              <View style={styles.metaForm}>
                {analyzing ? (
                  <View style={styles.analyzingRow}>
                    <ActivityIndicator size="small" />
                    <Text style={[styles.analyzingText, { color: c.textSecondary }]}>AI is detecting item details...</Text>
                  </View>
                ) : null}
                <TextInput
                  style={[styles.metaInput, { backgroundColor: c.inputBg, borderColor: c.borderStrong, color: c.text }]}
                  placeholder="Item name (e.g. White linen shirt)"
                  placeholderTextColor={c.placeholder}
                  value={itemName}
                  onChangeText={setItemName}
                  editable={!analyzing}
                />
                <TextInput
                  style={[styles.metaInput, { backgroundColor: c.inputBg, borderColor: c.borderStrong, color: c.text }]}
                  placeholder="Color (e.g. Navy blue)"
                  placeholderTextColor={c.placeholder}
                  value={itemColor}
                  onChangeText={setItemColor}
                  editable={!analyzing}
                />
                {detectedMetadata[0]?.category ? (
                  <Text style={[styles.metaNote, { color: c.textMuted }]}>Detected category: {detectedMetadata[0].category}</Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.metaForm}>
                {analyzing ? (
                  <View style={styles.analyzingRow}>
                    <ActivityIndicator size="small" />
                    <Text style={[styles.analyzingText, { color: c.textSecondary }]}>AI is detecting details for each item...</Text>
                  </View>
                ) : (
                  <Text style={[styles.metaNote, { color: c.textMuted }]}>
                    {detectedMetadata.filter(Boolean).length > 0
                      ? `Details auto-detected for ${detectedMetadata.filter(Boolean).length} of ${pickerAssets.length} items.`
                      : 'Items will be saved with default details.'}
                  </Text>
                )}
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost, { backgroundColor: c.surfaceAlt }]}
                onPress={handleCancelPreview}
                disabled={uploading}
              >
                <Text style={[styles.modalBtnText, styles.modalBtnTextGhost, { color: c.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={handleConfirmAdd}
                disabled={uploading}
              >
                <Text style={styles.modalBtnText}>Confirm add</Text>
              </TouchableOpacity>
            </View>

            {Platform.OS === 'ios' ? (
              <Text style={[styles.tipText, { color: c.textMuted }]}>Tip: long-press an item to delete it.</Text>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
  return screenContent;
}

const TILE = 108;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 32 },
  sectionList: { flex: 1 },
  flatListContent: { paddingBottom: 160 },
  title: { fontSize: 26, fontWeight: 'bold' },
  warningBanner: {
    marginBottom: 10,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff4dd',
    borderWidth: 1,
    borderColor: '#ffe2a6',
  },
  warningText: {
    color: '#7a4f00',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyStateBox: {
    borderWidth: 1,
    borderColor: '#ececec',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    marginBottom: 10,
    backgroundColor: '#fafafa',
  },
  emptyStateText: {
    color: '#444',
    fontSize: 14,
    fontWeight: '600',
  },

  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  editToggle: { fontSize: 15, fontWeight: '700' },
  editHint: { fontSize: 12, marginTop: -6, marginBottom: 10, lineHeight: 18 },
  deleteBadge: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: '#fff', borderRadius: 12,
  },
  editOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 4, paddingVertical: 3,
  },
  itemNameLabel: { fontSize: 9, fontWeight: '600', color: '#fff', textAlign: 'center' },
  // Move modal
  moveThumb: { width: 80, height: 80, borderRadius: 10, alignSelf: 'center', marginBottom: 6, backgroundColor: '#f0f0f0' },
  moveItemName: { fontSize: 13, textAlign: 'center', marginBottom: 16 },
  moveSectionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moveSectionTile: {
    width: '30%', paddingVertical: 12,
    borderWidth: 1.5, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  moveSectionLabel: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  moveSectionCurrent: { fontSize: 10, marginTop: 2 },
  cancelLink: { fontSize: 15, fontWeight: '600' },
  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  addBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#111',
    marginBottom: 12,
  },
  addBtnDisabled: { opacity: 0.6 },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  dropZone: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    minHeight: 150,
    marginBottom: 12,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  hideSectionBtn: { padding: 2 },
  restoreSectionsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center', paddingVertical: 10, marginTop: 4, marginBottom: 8,
  },
  restoreSectionsText: { fontSize: 13, fontWeight: '600' },
  emptyInSection: { paddingVertical: 10 },

  // ✅ Avoid `gap` because it’s inconsistent across RN versions; use margins.
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    minHeight: 88,
  },

  itemContainer: {
    width: TILE,
    height: TILE,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 8,
    marginBottom: 8,
  },
  itemImage: { width: '100%', height: '100%' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    padding: 16,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 22,
  },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalSubtitle: { marginTop: 4 },

  previewImage: {
    width: 120,
    height: 120,
    borderRadius: 10,
    marginRight: 10,
    backgroundColor: '#eee',
  },

  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  modalBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalBtnPrimary: { backgroundColor: '#111' },
  modalBtnGhost: { backgroundColor: '#f2f2f2' },
  modalBtnText: { fontWeight: '800', fontSize: 15, color: '#fff' },
  modalBtnTextGhost: { color: '#111' },

  tipText: { marginTop: 10, fontSize: 12, color: '#777' },

  // Catalog modal
  catalogHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancelLink: { fontSize: 15, fontWeight: '600' },
  catalogTabScroll: { maxHeight: 48 },
  catalogTabContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  catalogTab: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5, borderColor: 'transparent',
  },
  catalogTabActive: {},
  catalogTabText: { fontSize: 13, fontWeight: '700' },
  catalogItems: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },
  catalogRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8,
  },
  catalogRowSelected: { borderWidth: 1.5 },
  colorSwatch: { width: 28, height: 28, borderRadius: 6 },
  catalogImgWrap: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  catalogImg: { width: 40, height: 40 },
  catalogItemName: { flex: 1, fontSize: 14, fontWeight: '600' },
  catalogCheck: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  catalogFooter: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, paddingBottom: 32, borderTopWidth: StyleSheet.hairlineWidth,
  },
  catalogAddBtn: {
    backgroundColor: '#111', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },

  editThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    marginTop: 12,
    backgroundColor: '#eee',
  },
  metaForm: { marginTop: 14, gap: 8 },
  metaInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  metaNote: { fontSize: 12, marginTop: 2 },
  analyzingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  analyzingText: { fontSize: 13 },

  // Collections
  collectionsSection: { marginBottom: 8 },
  collectionsTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  collectionsTitle: { fontSize: 18, fontWeight: '800' },
  newCollectionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5,
  },
  newCollectionLabel: { fontSize: 13, fontWeight: '600' },
  newCollectionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 10,
  },
  newCollectionInput: {
    flex: 1, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 15,
  },
  createCollectionBtn: {
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
  },
  createCollectionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  collectionsScroll: { gap: 12, paddingRight: 4, paddingBottom: 4 },
  collectionCard: {
    width: 130, borderWidth: 1, borderRadius: 14,
    overflow: 'hidden', padding: 8,
  },
  collectionCardNew: {
    width: 160, borderWidth: 1, borderRadius: 14, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8,
  },
  collectionCardNewLabel: { fontSize: 12, textAlign: 'center', fontWeight: '600' },
  collectionGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginBottom: 8,
  },
  collectionThumb: {
    width: 55, height: 55, borderRadius: 6,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  collectionName: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  collectionCount: { fontSize: 11 },
});
