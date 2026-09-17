import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Image, ActivityIndicator, Alert, TextInput, FlatList,
} from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { analyzeGarmentPhoto } from '../services/garmentCropService';
import { removeBackgroundAndUpload } from '../services/backgroundRemovalService';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../context/ThemeContext';
import { storage } from '../firebase/firebaseConfig';
import { addClothingItem } from '../firebase/firestoreService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { searchClothingImages } from '../services/imageSearchService';

const GROQ_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;

const CATEGORY_ICONS = {
  tops: 'shirt-outline',
  bottoms: 'cut-outline',
  outerwear: 'layers-outline',
  footwear: 'footsteps-outline',
  accessories: 'watch-outline',
  one_piece: 'body-outline',
};

// ─── Vision analysis ──────────────────────────────────────────────────────────

function parseJSON(text) {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

async function identifyOutfitItems(imageUri) {
  // Resize to 512px — keeps base64 small enough for Groq's token limit
  const manipulated = await manipulateAsync(
    imageUri,
    [{ resize: { width: 768 } }],
    { compress: 0.8, format: SaveFormat.JPEG, base64: true }
  );
  const base64 = manipulated.base64;

  const prompt = `You are a professional fashion analyst. Look closely at this full-body photo and identify every clothing item the person is wearing.

For each item be as specific as possible — identify:
- Exact style details (e.g. cargo pockets, distressed, wide-leg, slim-fit, ribbed, cropped, oversized, pleated, tapered, zip-up, pullover, high-top, chelsea, lace-up, slip-on)
- Fabric/material if visible (e.g. linen, denim, leather, knit, fleece)
- Brand if a logo is visible
- Distinguishing features (e.g. double-breasted, tortoiseshell frame, quilted, striped)

Fields to return for each item:
- name: highly specific name (e.g. "White cargo pants with side pockets", "Washed black oversized hoodie", "Tan suede chelsea boots", NOT just "white pants" or "black hoodie")
- color: primary color including any secondary colors or washes (e.g. "acid wash blue", "off-white", "olive green")
- category: one of tops / bottoms / outerwear / footwear / accessories / one_piece
- searchQuery: specific Google Shopping search query that would find this exact item (e.g. "white cargo pants men", "oversized washed black hoodie", "tan suede chelsea boots men")

Respond with ONLY valid JSON — no other text:
{
  "items": [
    { "name": "...", "color": "...", "category": "...", "searchQuery": "..." }
  ]
}`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message || JSON.stringify(errBody);
    console.error('Groq vision error:', res.status, msg);
    throw new Error(`Vision API ${res.status}: ${msg}`);
  }
  const data   = await res.json();
  const parsed = parseJSON(data.choices[0].message.content);
  const raw = parsed.items || [];

  // Deduplicate: per category keep the item with the most specific (longest) name
  const byCategory = {};
  for (const item of raw) {
    const cat = item.category || 'other';
    if (!byCategory[cat] || item.name.length > byCategory[cat].name.length) {
      byCategory[cat] = item;
    }
  }
  return Object.values(byCategory);
}

async function uploadFromUrl(imageUrl, userId) {
  const res  = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const ext  = blob.type === 'image/png' ? 'png' : 'jpg';
  const path = `clothing/${userId}/${Date.now()}-scan.${ext}`;
  const ref  = storageRef(storage, path);
  await uploadBytes(ref, blob, { contentType: blob.type || 'image/jpeg' });
  return getDownloadURL(ref);
}

// ─── Item verification card ───────────────────────────────────────────────────

function ItemCard({ item, index, onSelectImage, onSkip, onSearchAgain, colors: c }) {
  const [customQuery, setCustomQuery] = useState('');
  const [showSearch, setShowSearch]   = useState(false);
  const [searching, setSearching]     = useState(false);

  const handleCustomSearch = async () => {
    if (!customQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchClothingImages(customQuery.trim(), 8);
      onSearchAgain(index, results, customQuery.trim());
      setShowSearch(false);
    } catch (err) {
      Alert.alert('Search failed', err.message);
    } finally {
      setSearching(false);
    }
  };

  const isSkipped   = item.selectedIdx === -1;
  const isConfirmed = item.selectedIdx !== null && item.selectedIdx >= 0;

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: isSkipped ? c.border : isConfirmed ? '#10b981' : c.border }]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <Ionicons name={CATEGORY_ICONS[item.category] || 'shirt-outline'} size={18} color={c.textSecondary} />
        <View style={styles.cardTitleGroup}>
          <Text style={[styles.cardName, { color: c.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.cardMeta, { color: c.textMuted }]}>{item.color} · {item.category}</Text>
        </View>
        {isConfirmed && <Ionicons name="checkmark-circle" size={22} color="#10b981" />}
        {isSkipped   && <Text style={[styles.skippedBadge, { color: c.textMuted }]}>Skipped</Text>}
      </View>

      {/* Product image candidates */}
      {item.candidates.length === 0 ? (
        <Text style={[styles.noCandidates, { color: c.textMuted }]}>No product images found</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.candidateScroll}>
          {item.candidates.map((candidate, i) => {
            const selected = item.selectedIdx === i;
            return (
              <Pressable
                key={i}
                onPress={() => onSelectImage(index, i)}
                style={[styles.candidateWrap, { borderColor: selected ? '#10b981' : c.border, backgroundColor: c.background }]}
              >
                <Image source={{ uri: candidate.thumbnailUrl }} style={styles.candidateImg} resizeMode="contain" />
                {selected && (
                  <View style={styles.selectedOverlay}>
                    <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Actions */}
      {!isSkipped && (
        <View style={styles.cardActions}>
          {showSearch ? (
            <View style={styles.searchRow}>
              <TextInput
                style={[styles.searchInput, { backgroundColor: c.inputBg, borderColor: c.borderStrong, color: c.text }]}
                value={customQuery}
                onChangeText={setCustomQuery}
                placeholder="Search differently..."
                placeholderTextColor={c.placeholder}
                returnKeyType="search"
                onSubmitEditing={handleCustomSearch}
                autoFocus
              />
              {searching
                ? <ActivityIndicator style={{ marginLeft: 8 }} />
                : (
                  <Pressable onPress={handleCustomSearch} hitSlop={8}>
                    <Ionicons name="search" size={20} color={c.text} />
                  </Pressable>
                )}
            </View>
          ) : (
            <Pressable style={styles.actionLink} onPress={() => { setCustomQuery(item.searchQuery); setShowSearch(true); }}>
              <Ionicons name="search-outline" size={14} color={c.textSecondary} />
              <Text style={[styles.actionLinkText, { color: c.textSecondary }]}>Search differently</Text>
            </Pressable>
          )}
          <Pressable style={styles.actionLink} onPress={() => onSkip(index)}>
            <Ionicons name="close-circle-outline" size={14} color={c.textMuted} />
            <Text style={[styles.actionLinkText, { color: c.textMuted }]}>Skip this item</Text>
          </Pressable>
        </View>
      )}
      {isSkipped && (
        <Pressable style={styles.actionLink} onPress={() => onSelectImage(index, 0)}>
          <Text style={[styles.actionLinkText, { color: c.textSecondary }]}>Undo skip</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function OutfitScanScreen({ route, navigation }) {
  const { imageUri } = route.params;
  const { user }     = useAuth();
  const c            = useColors();

  const [phase, setPhase]   = useState('analyzing'); // analyzing | verifying | adding
  const [items, setItems]   = useState([]);
  const [statusText, setStatusText] = useState('Analyzing your outfit...');
  const addingRef = useRef(false);

  // ── Run the full pipeline on mount ─────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        setStatusText('AI is identifying your clothing items...');
        const identified = await identifyOutfitItems(imageUri);

        if (!identified.length) {
          Alert.alert('No items found', 'The AI could not detect clothing items in this photo. Try a clearer full-body shot.');
          navigation.goBack();
          return;
        }

        setStatusText(`Found ${identified.length} item${identified.length !== 1 ? 's' : ''}. Searching for product images...`);

        const withCandidates = await Promise.all(
          identified.map(async (item, i) => {
            setStatusText(`Finding product images (${i + 1}/${identified.length})...`);
            const candidates = await searchClothingImages(item.searchQuery, 8).catch(() => []);
            return { ...item, candidates, selectedIdx: candidates.length > 0 ? 0 : null };
          })
        );

        setItems(withCandidates);
        setPhase('verifying');
      } catch (err) {
        Alert.alert('Error', err.message || 'Analysis failed. Please try again.');
        navigation.goBack();
      }
    })();
  }, []);

  // ── Item interactions ───────────────────────────────────────────────────────
  const handleSelectImage = useCallback((itemIdx, candidateIdx) => {
    setItems((prev) => prev.map((it, i) => i === itemIdx ? { ...it, selectedIdx: candidateIdx } : it));
  }, []);

  const handleSkip = useCallback((itemIdx) => {
    setItems((prev) => prev.map((it, i) => i === itemIdx ? { ...it, selectedIdx: -1 } : it));
  }, []);

  const handleSearchAgain = useCallback((itemIdx, newCandidates, newQuery) => {
    setItems((prev) => prev.map((it, i) =>
      i === itemIdx ? { ...it, candidates: newCandidates, selectedIdx: newCandidates.length > 0 ? 0 : null, searchQuery: newQuery } : it
    ));
  }, []);

  // ── Add confirmed items to closet ──────────────────────────────────────────
  const handleAdd = useCallback(async () => {
    if (addingRef.current) return; // prevent double-tap
    const toAdd = items.filter((it) => it.selectedIdx !== null && it.selectedIdx >= 0);
    if (!toAdd.length) { Alert.alert('Nothing selected', 'Select at least one item image.'); return; }

    addingRef.current = true;
    setPhase('adding');
    let added = 0;
    const errors = [];
    const skipped = [];
    for (const item of toAdd) {
      let tmpPath = null;
      let croppedUri = null;
      try {
        const candidate  = item.candidates[item.selectedIdx];
        const sourceUrl  = candidate.contentUrl || candidate.thumbnailUrl;

        // Download web image to a local temp file so we can crop it
        tmpPath = `${FileSystem.cacheDirectory}scan_${Date.now()}.jpg`;
        await FileSystem.downloadAsync(sourceUrl, tmpPath);

        // Crop to the single primary garment view (removes front+back product shots etc.)
        // and reject photos that show multiple different clothing items.
        const analysis = await analyzeGarmentPhoto(tmpPath);
        if (analysis.multipleItems) {
          skipped.push(item.name);
          continue;
        }
        croppedUri = analysis.croppedUri;

        // Upload the clean cropped image + run background removal
        const downloadURL = await uploadFromUrl(croppedUri, user.uid);
        const cutoutUrl   = await removeBackgroundAndUpload(croppedUri, user.uid).catch(() => null);

        await addClothingItem(user.uid, {
          imageUrl:   downloadURL,
          cutoutUrl:  cutoutUrl || null,
          category:   item.category,
          type:       'unknown',
          name:       item.name,
          color:      item.color,
          style:      '',
        });
        added++;
      } catch (err) {
        console.error('Failed to add item:', item.name, err.message);
        errors.push(item.name);
      } finally {
        if (tmpPath) FileSystem.deleteAsync(tmpPath, { idempotent: true }).catch(() => {});
        if (croppedUri && croppedUri !== tmpPath) FileSystem.deleteAsync(croppedUri, { idempotent: true }).catch(() => {});
      }
    }

    // Bust closet cache so ClosetScreen shows the new items immediately
    await AsyncStorage.removeItem(`closet_cache_${user.uid}`).catch(() => {});

    const skippedMsg = skipped.length
      ? `\n\nSkipped (photo shows multiple items): ${skipped.join(', ')}`
      : '';
    const msg = added > 0
      ? `${added} item${added !== 1 ? 's' : ''} added to your closet.${errors.length ? `\n\nCould not add: ${errors.join(', ')}` : ''}${skippedMsg}`
      : `Could not add items: ${errors.join(', ')}${skippedMsg}`;

    Alert.alert(added > 0 || skipped.length > 0 ? 'Done!' : 'Error', msg, [{
      text: 'Go to My Closet',
      onPress: () => navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'MyCloset' } }] }),
    }]);
    if (added === 0) setPhase('verifying');
    addingRef.current = false;
  }, [items, user?.uid, navigation]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const confirmedCount = items.filter((it) => it.selectedIdx !== null && it.selectedIdx >= 0).length;

  if (phase === 'analyzing') {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Image source={{ uri: imageUri }} style={styles.analyzeThumb} resizeMode="cover" />
        <ActivityIndicator size="large" style={{ marginTop: 24 }} />
        <Text style={[styles.statusText, { color: c.text }]}>{statusText}</Text>
      </View>
    );
  }

  if (phase === 'adding') {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" />
        <Text style={[styles.statusText, { color: c.text }]}>Adding items to your closet...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Header strip with outfit photo */}
      <View style={[styles.topStrip, { borderBottomColor: c.border }]}>
        <Image source={{ uri: imageUri }} style={styles.outfitThumb} resizeMode="cover" />
        <View style={styles.topInfo}>
          <Text style={[styles.topTitle, { color: c.text }]}>
            {items.length} item{items.length !== 1 ? 's' : ''} identified
          </Text>
          <Text style={[styles.topSub, { color: c.textMuted }]}>
            Tap the correct product image for each item, then add to your closet.
          </Text>
        </View>
      </View>

      {/* Item cards */}
      <FlatList
        data={items}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <ItemCard
            item={item}
            index={index}
            onSelectImage={handleSelectImage}
            onSkip={handleSkip}
            onSearchAgain={handleSearchAgain}
            colors={c}
          />
        )}
      />

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: c.border, backgroundColor: c.background }]}>
        <Pressable
          style={[styles.addBtn, confirmedCount === 0 && styles.addBtnDisabled]}
          onPress={handleAdd}
          disabled={confirmedCount === 0}
        >
          <Text style={styles.addBtnText}>
            {confirmedCount === 0
              ? 'Select at least one item'
              : `Add ${confirmedCount} item${confirmedCount !== 1 ? 's' : ''} to Closet`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  analyzeThumb: { width: 160, height: 240, borderRadius: 14 },
  statusText: { fontSize: 17, fontWeight: '700', marginTop: 16, textAlign: 'center' },
  statusSub:  { fontSize: 13, marginTop: 6, textAlign: 'center' },

  topStrip: {
    flexDirection: 'row', gap: 12, padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  outfitThumb: { width: 60, height: 90, borderRadius: 10 },
  topInfo:  { flex: 1, justifyContent: 'center' },
  topTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  topSub:   { fontSize: 13, lineHeight: 18 },

  listContent: { padding: 14, gap: 12, paddingBottom: 100 },

  card: { borderWidth: 1.5, borderRadius: 14, padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  cardTitleGroup: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700' },
  cardMeta: { fontSize: 12, marginTop: 2 },
  skippedBadge: { fontSize: 12, fontWeight: '600' },

  candidateScroll: { marginBottom: 10 },
  candidateWrap: {
    width: 90, height: 90, borderRadius: 10, borderWidth: 2,
    marginRight: 8, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  candidateImg: { width: '100%', height: '100%' },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16,185,129,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },

  noCandidates: { fontSize: 13, marginBottom: 10 },

  cardActions: { flexDirection: 'row', gap: 16, marginTop: 4 },
  actionLink:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionLinkText: { fontSize: 12, fontWeight: '600' },

  searchRow:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13 },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, paddingBottom: 32, borderTopWidth: StyleSheet.hairlineWidth,
  },
  addBtn: { backgroundColor: '#111', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  addBtnDisabled: { backgroundColor: '#999' },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
