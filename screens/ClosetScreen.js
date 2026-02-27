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
  Modal,
  ScrollView,
  RefreshControl,
  Platform,
  Pressable,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DraxProvider, DraxScrollView, DraxView } from 'react-native-drax';

import { useAuth } from '../context/AuthContext';
import { uploadImageToStorage } from '../firebase/uploadImageToStorage';
import { addClothingItem, getUserCloset } from '../firebase/firestoreService';

import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

const CACHE_TTL_MS = 1000 * 60 * 10; // 10 minutes
const DRAG_ACTIVATION_DELAY_MS = 180;

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

export default function ClosetScreen() {
  const { user } = useAuth();

  const [closetItems, setClosetItems] = useState([]);
  const [loadingCloset, setLoadingCloset] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [pickerAssets, setPickerAssets] = useState([]); // [{ uri, ... }]
  const [showPreview, setShowPreview] = useState(false);

  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
  const setUploadingSafe = (v) => {
    uploadingRef.current = v;
    setUploading(v);
  };

  // ✅ This fixes “can’t scroll” with drag: scroll disabled only while dragging.
  const [dragging, setDragging] = useState(false);

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
        const items = await getUserCloset(user.uid);
        const normalized = (items || []).map((it) => ({
          ...it,
          category: it.category || 'unassigned',
        }));
        setClosetItems(normalized);
        setLoadingCloset(false);
        await saveToCache(normalized);
      } catch (err) {
        console.error('Error loading closet:', err);
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

  const requestMediaPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'We need access to your photo library to add items.');
      return false;
    }
    return true;
  };

  const handleAddToClosetPress = async () => {
    console.log('ADD TO CLOSET pressed', { uid: user?.uid, uploading: uploadingRef.current });

    if (!user?.uid) {
      Alert.alert('Not logged in', 'Please log in to add items to your closet.');
      return;
    }
    if (uploadingRef.current) {
      Alert.alert('Uploading', 'Please wait for the current upload to finish.');
      return;
    }

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
    } catch (err) {
      console.error('ImagePicker error:', err);
      Alert.alert('Error', err?.message || 'Failed to open photo library.');
    }
  };

  const handleCancelPreview = () => {
    setShowPreview(false);
    setPickerAssets([]);
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

      for (let i = 0; i < assets.length; i++) {
        const uri = assets[i]?.uri;
        console.log('UPLOAD asset', i, { uri });

        const imageUrl = await withTimeout(
          uploadImageToStorage(uri, { folder: 'clothing', userId: user.uid }),
          60_000,
          `upload ${i + 1}/${assets.length}`
        );

        const docId = await withTimeout(
          addClothingItem(user.uid, {
            imageUrl,
            category: 'unassigned',
            type: 'unknown',
            color: 'unknown',
          }),
          60_000,
          `addClothingItem ${i + 1}/${assets.length}`
        );

        created.push({
          id: docId,
          imageUrl,
          category: 'unassigned',
        });
      }

      setClosetItems((prev) => [...created, ...prev]);
      await saveToCache([...created, ...closetItems]);

      setPickerAssets([]);
      Alert.alert('Success', `Added ${created.length} item(s) to your closet!`);
    } catch (err) {
      console.error('Confirm add error:', err);
      Alert.alert('Upload failed', err?.message || 'Failed to upload items.');
    } finally {
      setUploadingSafe(false);
    }
  };

  const grouped = useMemo(() => {
    const map = {};
    for (const c of CATEGORIES) map[c.key] = [];
    for (const it of closetItems) {
      const key = it.category || 'unassigned';
      if (!map[key]) map[key] = [];
      map[key].push(it);
    }
    return map;
  }, [closetItems]);

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

  // ✅ Key fix for measureLayout spam:
  // - Do NOT wrap the draggable with TouchableOpacity.
  // - Use a plain View that cannot collapse: collapsable={false}
  // - Use Pressable INSIDE, but keep the measured layout native.
  const renderDraggableItem = (item) => {
    return (
      <DraxView
        key={item.id}
        draggable
        longPressDelay={DRAG_ACTIVATION_DELAY_MS}
        dragPayload={item}
        style={styles.itemContainer}
        draggingStyle={styles.dragging}
        dragReleasedStyle={styles.dragging}
        hoverDraggingStyle={styles.hoverDragging}
        onDragStart={() => setDragging(true)}
        onDragEnd={() => setDragging(false)}
        onDragDrop={() => setDragging(false)}
      >
        <View style={{ flex: 1 }} collapsable={false}>
          <Pressable
            style={{ flex: 1 }}
            onLongPress={() => handleDeleteItem(item)}
          >
            <Image source={{ uri: item.imageUrl }} style={styles.itemImage} />
          </Pressable>
        </View>
      </DraxView>
    );
  };

  const CategoryDropZone = ({ categoryKey, title }) => {
    const items = grouped[categoryKey] || [];

    return (
      <DraxView
        receptive
        style={styles.dropZone}
        receivingStyle={styles.dropZoneReceiving}
        onReceiveDragDrop={async ({ dragged }) => {
          const draggedItem = dragged?.payload;
          if (!draggedItem) return;
          await updateItemCategory(draggedItem, categoryKey);
        }}
      >
        <Text style={styles.sectionTitle}>{title}</Text>

        {/* ✅ NON-scroll grid; page scroll stays in control */}
        <View style={styles.grid}>
          {items.length === 0 ? (
            <Text style={styles.emptyInSection}>Drop items here</Text>
          ) : (
            items.map(renderDraggableItem)
          )}
        </View>
      </DraxView>
    );
  };

  return (
    <DraxProvider>
      <View style={styles.container}>
        <Text style={styles.title}>My Closet</Text>

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

        <DraxScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 160 }}
          scrollEnabled={!dragging} // ✅ Scroll works again
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {loadingCloset && closetItems.length === 0 ? (
            <ActivityIndicator size="large" style={{ marginTop: 20 }} />
          ) : (
            <>
              {CATEGORIES.map((c) => (
                <CategoryDropZone key={c.key} categoryKey={c.key} title={c.label} />
              ))}
            </>
          )}
        </DraxScrollView>

        {/* Preview Modal */}
        <Modal visible={showPreview} animationType="slide" transparent>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Preview</Text>
              <Text style={styles.modalSubtitle}>{pickerAssets.length} image(s) selected</Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                {pickerAssets.map((a, idx) => (
                  <Image
                    key={`${a.uri}-${idx}`}
                    source={{ uri: a.uri }}
                    style={styles.previewImage}
                  />
                ))}
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnGhost]}
                  onPress={handleCancelPreview}
                  disabled={uploading}
                >
                  <Text style={[styles.modalBtnText, styles.modalBtnTextGhost]}>Cancel</Text>
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
                <Text style={styles.tipText}>Tip: long-press an item to delete it.</Text>
              ) : null}
            </View>
          </View>
        </Modal>
      </View>
    </DraxProvider>
  );
}

const TILE = 108;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 32, backgroundColor: '#ffffff' },
  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 14 },

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
    borderColor: '#e9e9e9',
    backgroundColor: '#fafafa',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  dropZoneReceiving: {
    borderColor: '#111',
  },

  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 10 },
  emptyInSection: { color: '#777', paddingVertical: 10 },

  // ✅ Avoid `gap` because it’s inconsistent across RN versions; use margins.
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  itemContainer: {
    width: TILE,
    height: TILE,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f1f1f1',
    marginRight: 8,
    marginBottom: 8,
  },
  itemImage: { width: '100%', height: '100%' },

  dragging: {
    opacity: 0.85,
  },
  hoverDragging: {
    borderWidth: 2,
    borderColor: '#111',
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 22,
  },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalSubtitle: { marginTop: 4, color: '#666' },

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
});
