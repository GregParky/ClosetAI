import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  ActivityIndicator, Alert, Modal, TextInput, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../context/ThemeContext';
import BodyOutfitPreview from '../components/BodyOutfitPreview';
import {
  getSavedOutfits,
  getBodyProfile,
  addOutfitToCollection,
  removeOutfitFromCollection,
  renameOutfitCollection,
  deleteOutfitCollection,
} from '../firebase/firestoreService';

const SCREEN_W = Dimensions.get('window').width;
// 2-column grid: 12px padding each side + 12px gap = 36px total; each tile is half the rest
const TILE_W = Math.floor((SCREEN_W - 36) / 2);
// Show ~64% of the 2.5× tall silhouette so head + torso + upper legs are visible
const TILE_THUMB_H = Math.floor(TILE_W * 1.6);

const PICKER_SILHOUETTE_W = 44;
const PICKER_SILHOUETTE_H = Math.floor(PICKER_SILHOUETTE_W * 2.5);

// ─── Outfit tile used inside the collection ────────────────────────────────────
function OutfitTile({ outfit, onRemove, colors: c, bodyProfile }) {
  return (
    <View style={[styles.tile, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={[styles.tileThumb, { height: TILE_THUMB_H, backgroundColor: c.surfaceAlt }]}>
        <BodyOutfitPreview outfit={outfit} bodyProfile={bodyProfile} width={TILE_W} />
      </View>
      <Text style={[styles.tileName, { color: c.text }]} numberOfLines={2}>{outfit.name}</Text>
      <Pressable style={styles.removeBtn} onPress={() => onRemove(outfit)} hitSlop={6}>
        <Ionicons name="remove-circle" size={20} color="#e0374a" />
      </Pressable>
    </View>
  );
}

// ─── Picker modal — pick saved outfits to add ──────────────────────────────────
function AddOutfitPicker({ visible, savedOutfits, collectionOutfitIds, onAdd, onClose, colors: c, bodyProfile }) {
  // Filter out outfits already in the collection, then deduplicate by name
  // (case-insensitive) to avoid showing the same outfit saved multiple times.
  const seenNames = new Set();
  const available = savedOutfits.filter((o) => {
    if (collectionOutfitIds.includes(o.id)) return false;
    const key = (o.name ?? '').toLowerCase().trim();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.pickerBackdrop}>
        <View style={[styles.pickerSheet, { backgroundColor: c.background }]}>
          <View style={[styles.pickerHeader, { borderBottomColor: c.border }]}>
            <Text style={[styles.pickerTitle, { color: c.text }]}>Add an outfit</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={c.text} />
            </Pressable>
          </View>
          {available.length === 0 ? (
            <Text style={[styles.pickerEmpty, { color: c.textMuted }]}>
              All your saved outfits are already in this collection.
            </Text>
          ) : (
            <FlatList
              data={available}
              keyExtractor={(o) => o.id}
              contentContainerStyle={{ padding: 16, gap: 10 }}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.pickerRow, { backgroundColor: c.surface, borderColor: c.border }]}
                  onPress={() => onAdd(item)}
                >
                  <View style={[styles.pickerThumb, { backgroundColor: c.surfaceAlt }]}>
                    <BodyOutfitPreview outfit={item} bodyProfile={bodyProfile} width={PICKER_SILHOUETTE_W} />
                  </View>
                  <Text style={[styles.pickerName, { color: c.text }]} numberOfLines={2}>{item.name}</Text>
                  <Ionicons name="add-circle-outline" size={22} color={c.text} />
                </Pressable>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function CollectionDetailScreen({ route, navigation }) {
  const { collection: initialCollection } = route.params;
  const { user } = useAuth();
  const c = useColors();

  const [collectionData, setCollectionData] = useState(initialCollection);
  const [savedOutfits, setSavedOutfits]     = useState([]);
  const [bodyProfile, setBodyProfile]       = useState(null);
  const [loading, setLoading]               = useState(true);
  const [showPicker, setShowPicker]         = useState(false);
  const [renaming, setRenaming]             = useState(false);
  const [newName, setNewName]               = useState(initialCollection.name);

  // Strip modelPhotoUrl so silhouette previews never trigger the virtual try-on API
  const previewProfile = useMemo(() => ({
    buildType: bodyProfile?.buildType ?? 'average',
    modelPhotoUrl: null,
  }), [bodyProfile]);

  const outfitsInCollection = savedOutfits.filter((o) =>
    (collectionData.outfitIds || []).includes(o.id)
  );

  const loadSaved = useCallback(async () => {
    setLoading(true);
    const [all, profile] = await Promise.all([
      getSavedOutfits(user.uid).catch(() => []),
      getBodyProfile(user.uid).catch(() => null),
    ]);
    setSavedOutfits(all);
    setBodyProfile(profile);
    setLoading(false);
  }, [user.uid]);

  useEffect(() => {
    loadSaved();
    navigation.setOptions({ title: collectionData.name });
  }, []);

  const handleAdd = async (outfit) => {
    setShowPicker(false);
    await addOutfitToCollection(collectionData.id, outfit.id);
    setCollectionData((prev) => ({
      ...prev,
      outfitIds: [...(prev.outfitIds || []), outfit.id],
    }));
  };

  const handleRemove = (outfit) => {
    Alert.alert('Remove outfit', `Remove "${outfit.name}" from this collection?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await removeOutfitFromCollection(collectionData.id, outfit.id);
          setCollectionData((prev) => ({
            ...prev,
            outfitIds: (prev.outfitIds || []).filter((id) => id !== outfit.id),
          }));
        },
      },
    ]);
  };

  const handleRename = async () => {
    if (!newName.trim()) return;
    await renameOutfitCollection(collectionData.id, newName.trim());
    setCollectionData((prev) => ({ ...prev, name: newName.trim() }));
    navigation.setOptions({ title: newName.trim() });
    setRenaming(false);
  };

  const handleDelete = () => {
    Alert.alert('Delete collection', `Delete "${collectionData.name}"? The outfits themselves won't be affected.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteOutfitCollection(collectionData.id);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      {/* Rename modal */}
      <Modal visible={renaming} transparent animationType="fade">
        <View style={styles.renameBackdrop}>
          <View style={[styles.renameCard, { backgroundColor: c.background }]}>
            <Text style={[styles.renameTitle, { color: c.text }]}>Rename collection</Text>
            <TextInput
              style={[styles.renameInput, { backgroundColor: c.inputBg, borderColor: c.borderStrong, color: c.text }]}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleRename}
            />
            <View style={styles.renameBtns}>
              <Pressable onPress={() => { setRenaming(false); setNewName(collectionData.name); }} style={styles.renameCancel}>
                <Text style={{ color: c.textMuted, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleRename} style={styles.renameSave}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Header actions */}
      <View style={[styles.actionsRow, { borderBottomColor: c.border }]}>
        <Pressable style={[styles.actionBtn, { borderColor: c.border }]} onPress={() => setRenaming(true)}>
          <Ionicons name="pencil-outline" size={14} color={c.text} />
          <Text style={[styles.actionLabel, { color: c.text }]}>Rename</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, { borderColor: c.border }]} onPress={() => setShowPicker(true)}>
          <Ionicons name="add" size={14} color={c.text} />
          <Text style={[styles.actionLabel, { color: c.text }]}>Add outfit</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, { borderColor: '#e0374a' }]} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={14} color="#e0374a" />
          <Text style={[styles.actionLabel, { color: '#e0374a' }]}>Delete</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator /></View>
      ) : outfitsInCollection.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="albums-outline" size={44} color={c.border} />
          <Text style={[styles.emptyTitle, { color: c.text }]}>No outfits yet</Text>
          <Text style={[styles.emptyHint, { color: c.textMuted }]}>Tap "Add outfit" to start filling this collection.</Text>
        </View>
      ) : (
        <FlatList
          data={outfitsInCollection}
          keyExtractor={(o) => o.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: 12 }}
          renderItem={({ item }) => (
            <OutfitTile outfit={item} onRemove={handleRemove} colors={c} bodyProfile={previewProfile} />
          )}
        />
      )}

      <AddOutfitPicker
        visible={showPicker}
        savedOutfits={savedOutfits}
        collectionOutfitIds={collectionData.outfitIds || []}
        onAdd={handleAdd}
        onClose={() => setShowPicker(false)}
        colors={c}
        bodyProfile={previewProfile}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginTop: 12, marginBottom: 6 },
  emptyHint: { fontSize: 13, textAlign: 'center', lineHeight: 19 },

  actionsRow: {
    flexDirection: 'row', gap: 8, padding: 12,
    borderBottomWidth: 1,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  actionLabel: { fontSize: 13, fontWeight: '600' },

  grid: { padding: 12, gap: 12 },
  tile: {
    width: TILE_W,
    borderWidth: 1, borderRadius: 14, overflow: 'hidden',
    position: 'relative',
  },
  tileThumb: {
    width: TILE_W,
    overflow: 'hidden',
  },
  tileName: {
    fontSize: 12, fontWeight: '600', padding: 8, paddingTop: 6,
  },
  removeBtn: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 12,
  },

  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1,
  },
  pickerTitle: { fontSize: 17, fontWeight: '800' },
  pickerEmpty: { padding: 32, textAlign: 'center', fontSize: 14 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6,
  },
  pickerThumb: {
    width: PICKER_SILHOUETTE_W,
    height: PICKER_SILHOUETTE_H,
    borderRadius: 8,
    overflow: 'hidden',
  },
  pickerName: { flex: 1, fontSize: 14, fontWeight: '600' },

  renameBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  renameCard: { borderRadius: 16, padding: 20 },
  renameTitle: { fontSize: 17, fontWeight: '800', marginBottom: 12 },
  renameInput: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 16, marginBottom: 16,
  },
  renameBtns: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  renameCancel: { paddingHorizontal: 16, paddingVertical: 10 },
  renameSave: {
    backgroundColor: '#111', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10,
  },
});
