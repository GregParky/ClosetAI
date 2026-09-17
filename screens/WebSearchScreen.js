import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable, FlatList,
  Image, ActivityIndicator, Alert, Modal, ScrollView,
} from 'react-native';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../context/ThemeContext';
import { storage } from '../firebase/firebaseConfig';
import { addClothingItem } from '../firebase/firestoreService';
import { searchClothingImages } from '../services/imageSearchService';

const CATEGORIES = [
  { key: 'tops',        label: 'Tops'       },
  { key: 'bottoms',     label: 'Bottoms'    },
  { key: 'outerwear',   label: 'Outerwear'  },
  { key: 'footwear',    label: 'Footwear'   },
  { key: 'one_piece',   label: 'One Piece'  },
  { key: 'accessories', label: 'Accessories'},
  { key: 'unassigned',  label: 'Other'      },
];

// Download a web image URL and upload it to Firebase Storage.
async function uploadFromUrl(imageUrl, userId) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to download image (${res.status})`);
  const blob = await res.blob();
  const ext  = blob.type === 'image/png' ? 'png' : 'jpg';
  const path = `clothing/${userId}/${Date.now()}-web.${ext}`;
  const ref  = storageRef(storage, path);
  await uploadBytes(ref, blob, { contentType: blob.type || 'image/jpeg' });
  return getDownloadURL(ref);
}

// ─── Selected image detail modal ─────────────────────────────────────────────

function AddModal({ result, onAdd, onClose, colors: c }) {
  const [name, setName]     = useState(result?.name?.split(' ').slice(0, 6).join(' ') || '');
  const [color, setColor]   = useState('');
  const [category, setCategory] = useState('tops');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    setAdding(true);
    await onAdd({ imageUrl: result.contentUrl, name: name.trim(), color: color.trim(), category });
    setAdding(false);
  };

  return (
    <Modal visible animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: c.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Add to Closet</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={c.textMuted} />
            </Pressable>
          </View>

          {/* Preview */}
          <Image
            source={{ uri: result.thumbnailUrl }}
            style={styles.previewImg}
            resizeMode="contain"
          />

          {/* Name */}
          <Text style={[styles.inputLabel, { color: c.textMuted }]}>Item Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.borderStrong, color: c.text }]}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Nike Air Force 1"
            placeholderTextColor={c.placeholder}
          />

          {/* Color */}
          <Text style={[styles.inputLabel, { color: c.textMuted }]}>Color (optional)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.borderStrong, color: c.text }]}
            value={color}
            onChangeText={setColor}
            placeholder="e.g. White"
            placeholderTextColor={c.placeholder}
          />

          {/* Category */}
          <Text style={[styles.inputLabel, { color: c.textMuted }]}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
            {CATEGORIES.map((cat) => (
              <Pressable
                key={cat.key}
                style={[styles.catChip, { borderColor: c.borderStrong }, category === cat.key && styles.catChipActive]}
                onPress={() => setCategory(cat.key)}
              >
                <Text style={[styles.catChipText, { color: c.textSecondary }, category === cat.key && styles.catChipTextActive]}>
                  {cat.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {adding ? (
            <View style={styles.addingRow}>
              <ActivityIndicator />
              <Text style={[styles.addingText, { color: c.textMuted }]}>Downloading & adding...</Text>
            </View>
          ) : (
            <Pressable style={styles.addBtn} onPress={handleAdd}>
              <Text style={styles.addBtnText}>Add to My Closet</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function WebSearchScreen({ navigation }) {
  const { user } = useAuth();
  const c = useColors();
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState([]);
  const [searching, setSearching]   = useState(false);
  const [searched, setSearched]     = useState(false);
  const [selected, setSelected]     = useState(null);
  const inputRef = useRef(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearched(true);
    setResults([]);
    try {
      const imgs = await searchClothingImages(query.trim());
      setResults(imgs);
    } catch (err) {
      if (err.message === 'MISSING_KEY') {
        Alert.alert(
          'SerpApi Key Required',
          'Add this to your .env file:\n\nEXPO_PUBLIC_SERP_KEY=your_key\n\n' +
          'Get a free key at serpapi.com (100 searches/month, no credit card).'
        );
      } else {
        Alert.alert('Search failed', err.message);
      }
    } finally {
      setSearching(false);
    }
  }, [query]);

  const handleAdd = useCallback(async ({ imageUrl, name, color, category }) => {
    if (!user?.uid) return;
    try {
      const downloadURL = await uploadFromUrl(imageUrl, user.uid);
      await addClothingItem(user.uid, {
        imageUrl: downloadURL,
        category,
        type: 'unknown',
        name,
        color: color || 'unknown',
        style: '',
      });
      setSelected(null);
      Alert.alert('Added!', `"${name}" is now in your closet.`);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not add item. The image may be protected.');
    }
  }, [user?.uid]);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Search bar */}
      <View style={[styles.searchBar, { backgroundColor: c.inputBg, borderColor: c.borderStrong }]}>
        <Ionicons name="search-outline" size={18} color={c.textMuted} />
        <TextInput
          ref={inputRef}
          style={[styles.searchInput, { color: c.text }]}
          placeholder="Search for a clothing item..."
          placeholderTextColor={c.placeholder}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          onSubmitEditing={handleSearch}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
        {query.length > 0 && (
          <Pressable onPress={() => { setQuery(''); setResults([]); setSearched(false); }} hitSlop={8}>
            <Ionicons name="close-circle" size={17} color={c.textMuted} />
          </Pressable>
        )}
      </View>

      <Pressable
        style={[styles.searchBtn, searching && styles.searchBtnDisabled]}
        onPress={handleSearch}
        disabled={searching || !query.trim()}
      >
        <Text style={styles.searchBtnText}>{searching ? 'Searching...' : 'Search'}</Text>
      </Pressable>

      {/* Hint */}
      {!searched && (
        <View style={styles.hintBox}>
          <Ionicons name="bulb-outline" size={20} color={c.textMuted} />
          <Text style={[styles.hintText, { color: c.textMuted }]}>
            Try searching for specific items you own — e.g.{'\n'}
            "Nike Air Force 1 White" or "Levi 501 Jeans"
          </Text>
        </View>
      )}

      {searching && (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={[styles.loadingText, { color: c.textMuted }]}>Finding images...</Text>
        </View>
      )}

      {!searching && searched && results.length === 0 && (
        <View style={styles.center}>
          <Ionicons name="image-outline" size={40} color={c.border} />
          <Text style={[styles.emptyText, { color: c.textMuted }]}>No images found. Try a different search.</Text>
        </View>
      )}

      {/* Results grid */}
      <FlatList
        data={results}
        keyExtractor={(_, i) => String(i)}
        numColumns={3}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <Pressable style={[styles.gridCell, { backgroundColor: c.surfaceAlt }]} onPress={() => setSelected(item)}>
            <Image source={{ uri: item.thumbnailUrl }} style={styles.gridImg} resizeMode="cover" />
          </Pressable>
        )}
      />

      {selected && (
        <AddModal
          result={selected}
          onAdd={handleAdd}
          onClose={() => setSelected(null)}
          colors={c}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 16, marginBottom: 8,
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15 },
  searchBtn: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#111', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  searchBtnDisabled: { backgroundColor: '#999' },
  searchBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  hintBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    margin: 24, padding: 16,
  },
  hintText: { flex: 1, fontSize: 14, lineHeight: 22 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  loadingText: { fontSize: 14 },
  emptyText: { fontSize: 14, textAlign: 'center' },
  grid: { paddingHorizontal: 8, paddingBottom: 32, gap: 4 },
  gridCell: { flex: 1, margin: 2, aspectRatio: 1, borderRadius: 8, overflow: 'hidden' },
  gridImg: { width: '100%', height: '100%' },
  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 36 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  previewImg: { width: '100%', height: 180, borderRadius: 12, marginBottom: 16, backgroundColor: '#f0f0f0' },
  inputLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 14 },
  catScroll: { marginBottom: 16 },
  catChip: {
    borderWidth: 1.5, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7, marginRight: 8,
  },
  catChipActive: { borderColor: '#111', backgroundColor: '#111' },
  catChipText: { fontSize: 13, fontWeight: '600' },
  catChipTextActive: { color: '#fff' },
  addBtn: { backgroundColor: '#111', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  addingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14 },
  addingText: { fontSize: 14 },
});
