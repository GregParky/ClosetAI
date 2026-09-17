import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Image,
  FlatList,
  RefreshControl,
  ScrollView,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../context/ThemeContext';
import { getUserCloset, getUserPreferences, getSavedOutfits, saveOutfit, unsaveOutfit, logWear, getUserLikedOutfits, getOutfitRatings, saveWearRating, getTopRatedOutfits, getOutfitCollections, addOutfitToCollection } from '../firebase/firestoreService';
import { scoreColor, scoreLabel } from '../services/eloService';
import { useNavigation } from '@react-navigation/native';
import { getWeather, getWeatherForCity } from '../weatherService';
import { generateAIOutfits } from '../services/aiOutfitService';

const DRESS_CODES = ['Casual', 'Smart Casual', 'Business Casual', 'Formal', 'Athletic'];

function closetGapMessage(items) {
  const has = (cat) => items.some((i) => i.category === cat);
  const hasShoes     = has('footwear');
  const hasTops      = has('tops');
  const hasBottoms   = has('bottoms');
  const hasOnePiece  = has('one_piece');
  const hasOuterwear = has('outerwear');

  const canComplete = hasShoes && (hasOnePiece || (hasTops && hasBottoms));
  if (canComplete) return null; // closet is sufficient

  const missing = [];

  if (!hasShoes) {
    missing.push('👟 Footwear — at least one pair of shoes, sneakers, or boots');
  }

  if (!hasOnePiece) {
    if (!hasTops && !hasBottoms) {
      missing.push('👕 Tops — shirts, hoodies, sweaters, or similar');
      missing.push('👖 Bottoms — jeans, pants, shorts, or similar');
    } else if (!hasTops) {
      missing.push('👕 Tops — shirts, hoodies, sweaters, or similar');
    } else if (!hasBottoms) {
      missing.push('👖 Bottoms — jeans, pants, shorts, or similar');
    }
  }

  if (missing.length === 0) return null;

  const tip = !hasOnePiece && !hasTops && !hasBottoms
    ? '\n\nAlternatively, add a one-piece item like a suit or jumpsuit.'
    : !hasOnePiece
    ? '\n\nAlternatively, a one-piece item (suit, jumpsuit) can replace a top + bottom pair.'
    : '';

  return `To generate outfits you need:\n\n${missing.join('\n')}${tip}`;
}

function ScorePill({ score, colors: c }) {
  if (score === undefined || score === null) return null;
  const color = scoreColor(score);
  return (
    <View style={[styles.scorePill, { backgroundColor: color + '18', borderColor: color }]}>
      <Ionicons name="star" size={10} color={color} />
      <Text style={[styles.scorePillText, { color }]}>{scoreLabel(score)}</Text>
    </View>
  );
}

function OutfitCard({ suggestion, idx, onSave, onUnsave, onWear, saved, rating, colors: c }) {
  const nav = useNavigation();
  const rows = [];
  if (suggestion.onePiece) rows.push({ label: 'One Piece', item: suggestion.onePiece });
  if (suggestion.top) rows.push({ label: 'Top', item: suggestion.top });
  if (suggestion.bottom) rows.push({ label: 'Bottom', item: suggestion.bottom });
  if (suggestion.layer) rows.push({ label: 'Layer', item: suggestion.layer });
  if (suggestion.shoes) rows.push({ label: 'Shoes', item: suggestion.shoes });

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: c.text }]}>{suggestion.name || `Suggestion ${idx + 1}`}</Text>
        <ScorePill score={rating?.score} colors={c} />
        <Pressable
          style={styles.saveIconBtn}
          onPress={saved ? () => onUnsave(suggestion) : () => onSave(suggestion)}
          hitSlop={8}
        >
          <Ionicons
            name={saved ? 'bookmark' : 'bookmark-outline'}
            size={20}
            color={saved ? '#3b82f6' : c.textMuted}
          />
          <Text style={[styles.saveIconLabel, { color: saved ? '#3b82f6' : c.textMuted }]}>
            {saved ? 'Saved' : 'Save'}
          </Text>
        </Pressable>
      </View>
      {suggestion.savedFrom?.displayName ? (
        <Pressable
          style={[styles.attributionRow, { backgroundColor: c.surfaceAlt }]}
          onPress={() => suggestion.savedFrom?.userId && nav.navigate('OtherProfile', { userId: suggestion.savedFrom.userId })}
        >
          <Ionicons name="person-circle-outline" size={13} color={c.textMuted} />
          <Text style={[styles.attributionText, { color: c.textMuted }]}>
            Saved from {suggestion.savedFrom.displayName}
          </Text>
          <Ionicons name="chevron-forward" size={11} color={c.textMuted} />
        </Pressable>
      ) : null}
      {suggestion.description ? (
        <Text style={[styles.cardDesc, { color: c.textSecondary }]}>{suggestion.description}</Text>
      ) : null}
      {rows.map((row) => (
        <View key={`${suggestion.id}-${row.label}`} style={styles.row}>
          <View style={[styles.thumbWrap, { backgroundColor: c.surfaceAlt }]}>
            {row.item?.imageUrl ? (
              <Image source={{ uri: row.item.imageUrl }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, { backgroundColor: c.border }]} />
            )}
          </View>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: c.textSecondary }]}>{row.label}</Text>
            <Text style={[styles.rowValue, { color: c.text }]}>
              {row.item?.name || row.item?.type || row.item?.category || 'Closet item'}
            </Text>
          </View>
        </View>
      ))}
      {onWear && (
        <Pressable
          style={[styles.wornBtn, { borderColor: c.borderStrong }]}
          onPress={() => onWear(suggestion)}
        >
          <Ionicons name="checkmark-circle-outline" size={15} color={c.textSecondary} />
          <Text style={[styles.wornBtnText, { color: c.textSecondary }]}>Worn Today</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function OutfitScreen({ navigation }) {
  const { user } = useAuth();
  const c = useColors();
  const [activeTab, setActiveTab] = useState('generated');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [generateError, setGenerateError] = useState('');
  const [closetItems, setClosetItems] = useState([]);
  const [preferences, setPreferences] = useState({});
  const [weather, setWeather] = useState(null);
  const [dressCode, setDressCode] = useState('Casual');
  const [suggestions, setSuggestions] = useState([]);
  const [savedOutfits, setSavedOutfits] = useState([]);
  const [savingIds, setSavingIds] = useState(new Set());
  const [likedOutfitsCache, setLikedOutfitsCache] = useState([]);
  const [ratingsMap, setRatingsMap] = useState({});
  const [ratingOutfit, setRatingOutfit] = useState(null); // outfit awaiting wear rating
  const [locationOverride, setLocationOverride] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationInput, setLocationInput] = useState('');
  const hasAutoGenerated = useRef(false);
  const [collections, setCollections] = useState([]);
  const [collectionPicker, setCollectionPicker] = useState(null); // outfit being added to a collection

  // A unique fingerprint for an outfit based on its item IDs
  const outfitSignature = useCallback((outfit) =>
    [outfit.top?.id, outfit.bottom?.id, outfit.onePiece?.id, outfit.layer?.id, outfit.shoes?.id]
      .filter(Boolean).sort().join(',')
  , []);

  // Set of signatures already saved — used to detect duplicates
  const savedSignatures = useMemo(
    () => new Set(savedOutfits.map(outfitSignature)),
    [savedOutfits, outfitSignature]
  );

  // Deduplicated saved list (handles duplicates that were saved before this fix)
  const uniqueSavedOutfits = useMemo(() => {
    const seen = new Set();
    return savedOutfits.filter((o) => {
      const sig = outfitSignature(o);
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
  }, [savedOutfits, outfitSignature]);

  const loadData = useCallback(async () => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const [itemsResult, prefsResult, weatherResult, savedResult, likedResult] = await Promise.allSettled([
        getUserCloset(user.uid),
        getUserPreferences(user.uid),
        getWeather(),
        getSavedOutfits(user.uid),
        getUserLikedOutfits(user.uid, 10),
      ]);
      const items = itemsResult.status === 'fulfilled'
        ? Array.isArray(itemsResult.value) ? itemsResult.value : []
        : [];
      const prefs = prefsResult.status === 'fulfilled' ? prefsResult.value || {} : {};
      const temp = weatherResult.status === 'fulfilled' ? weatherResult.value?.temperature ?? null : null;
      const saved = savedResult.status === 'fulfilled'
        ? Array.isArray(savedResult.value) ? savedResult.value : []
        : [];
      const liked = likedResult.status === 'fulfilled'
        ? Array.isArray(likedResult.value) ? likedResult.value : []
        : [];
      setClosetItems(items);
      setPreferences(prefs);
      setWeather(temp);
      setSavedOutfits(saved);
      setLikedOutfitsCache(liked);
      getOutfitRatings(user.uid).then(setRatingsMap).catch(() => {});
      getOutfitCollections(user.uid).then(setCollections).catch(() => {});
    } catch {
      setLoadError('Could not load closet data.');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  const generate = useCallback(async (items, prefs, temp, code, liked = []) => {
    if (!items.length) return;
    setGenerating(true);
    setGenerateError('');
    setSuggestions([]);
    try {
      const topRated = user?.uid ? await getTopRatedOutfits(user.uid).catch(() => []) : [];
      const outfits = await generateAIOutfits({
        closetItems: items,
        temperature: temp,
        preferences: prefs,
        dressCode: code,
        likedOutfits: liked,
        topRatedOutfits: topRated,
      });
      setSuggestions(outfits);
      if (outfits.length === 0) {
        const gap = closetGapMessage(closetItems);
        setGenerateError(
          gap
            ? `Couldn't build a complete outfit. ${gap}`
            : 'No valid outfits could be generated. Try adding more variety to your closet — different shoes, tops, or bottoms.'
        );
      }
    } catch (err) {
      console.error('AI outfit generation failed:', err);
      setGenerateError('Failed to generate outfits. Check your API key and try again.');
    } finally {
      setGenerating(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!loading && closetItems.length > 0 && !hasAutoGenerated.current) {
      hasAutoGenerated.current = true;
      generate(closetItems, preferences, weather, dressCode, likedOutfitsCache);
    }
  }, [loading, closetItems, preferences, weather]);

  const handleSave = useCallback(async (outfit) => {
    if (!user?.uid || savingIds.has(outfit.id)) return;
    if (savedSignatures.has(outfitSignature(outfit))) {
      Alert.alert('Already saved', 'This outfit is already in your saved outfits.');
      return;
    }
    setSavingIds((prev) => new Set(prev).add(outfit.id));
    try {
      const docId = await saveOutfit(user.uid, outfit);
      setSavedOutfits((prev) => [{ ...outfit, id: docId, savedAt: new Date() }, ...prev]);
    } catch (err) {
      console.error('Save outfit failed:', err);
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(outfit.id);
        return next;
      });
    }
  }, [user?.uid, savingIds]);

  const handleSetLocation = useCallback(async (city) => {
    setShowLocationModal(false);
    setWeatherLoading(true);
    try {
      const wx = await getWeatherForCity(city);
      setWeather(wx.temperature);
      setLocationOverride(wx.city);
    } catch (err) {
      Alert.alert('City not found', `Could not find weather for "${city}". Check the spelling and try again.`);
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  const handleClearLocation = useCallback(async () => {
    setShowLocationModal(false);
    setLocationOverride(null);
    setWeatherLoading(true);
    try {
      const wx = await getWeather();
      setWeather(wx?.temperature ?? null);
    } catch {
      setWeather(null);
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  const handleWear = useCallback(async (outfit) => {
    if (!user?.uid) return;
    try {
      await logWear(user.uid, outfit);
      // Only prompt for rating on saved outfits (they have a real Firestore ID)
      if (!outfit.id?.startsWith('ai-')) {
        setRatingOutfit(outfit);
      }
    } catch (err) {
      console.error('logWear failed:', err);
    }
  }, [user?.uid]);

  const handleSubmitRating = useCallback(async (score) => {
    if (!user?.uid || !ratingOutfit) return;
    setRatingOutfit(null);
    try {
      await saveWearRating(user.uid, ratingOutfit.id, ratingOutfit, score);
    } catch (err) {
      console.error('saveWearRating failed:', err);
    }
  }, [user?.uid, ratingOutfit]);

  const handleUnsave = useCallback(async (outfit) => {
    if (!user?.uid) return;
    setSavedOutfits((prev) => prev.filter((o) => o.id !== outfit.id));
    try {
      await unsaveOutfit(outfit.id);
    } catch (err) {
      console.error('Unsave outfit failed:', err);
      loadData();
    }
  }, [user?.uid, loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator />
        <Text style={[styles.centerText, { color: c.textSecondary }]}>Loading your closet...</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text style={styles.errorTitle}>Outfit Suggestions Unavailable</Text>
        <Text style={[styles.centerText, { color: c.textSecondary }]}>{loadError}</Text>
        <Pressable style={styles.retryBtn} onPress={loadData}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const gapMsg = closetGapMessage(closetItems);
  if (gapMsg) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Ionicons name="shirt-outline" size={44} color={c.border} style={{ marginBottom: 12 }} />
        <Text style={[styles.emptyTitle, { color: c.text }]}>A few more items needed</Text>
        <Text style={[styles.centerText, { color: c.textSecondary, textAlign: 'left', alignSelf: 'stretch', marginHorizontal: 24 }]}>
          {gapMsg}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: c.text }]}>AI Outfit Suggestions</Text>
        <View style={styles.headerRight}>
          {weather != null && (
            <Text style={[styles.weatherBadge, { backgroundColor: c.surfaceAlt, color: c.textSecondary }]}>
              {Math.round(weather)}°F
            </Text>
          )}
        </View>
      </View>

      {/* Location bar */}
      <Pressable
        style={[styles.locationBar, { backgroundColor: c.surfaceAlt, borderColor: locationOverride ? '#111' : c.border }]}
        onPress={() => { setLocationInput(''); setShowLocationModal(true); }}
      >
        <Ionicons name={locationOverride ? 'location' : 'location-outline'} size={14} color={locationOverride ? c.text : c.textSecondary} />
        <Text style={[styles.locationLabel, { color: locationOverride ? c.text : c.textSecondary }]}>
          {weatherLoading ? 'Updating weather...' : (locationOverride ?? 'My Location')}
        </Text>
        {weatherLoading && <ActivityIndicator size="small" style={{ marginLeft: 4 }} />}
        {locationOverride && !weatherLoading && (
          <Pressable hitSlop={8} onPress={handleClearLocation}>
            <Ionicons name="close-circle" size={15} color={c.textMuted} />
          </Pressable>
        )}
        {!locationOverride && <Ionicons name="chevron-down" size={13} color={c.textMuted} />}
      </Pressable>

      <View style={[styles.tabRow, { backgroundColor: c.tabBg }]}>
        <Pressable
          style={[styles.tab, activeTab === 'generated' && [styles.tabActive, { backgroundColor: c.tabActive }]]}
          onPress={() => setActiveTab('generated')}
        >
          <Text style={[styles.tabText, { color: c.textMuted }, activeTab === 'generated' && { color: c.text }]}>
            For You
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'saved' && [styles.tabActive, { backgroundColor: c.tabActive }]]}
          onPress={() => setActiveTab('saved')}
        >
          <Text style={[styles.tabText, { color: c.textMuted }, activeTab === 'saved' && { color: c.text }]}>
            Saved {uniqueSavedOutfits.length > 0 ? `(${uniqueSavedOutfits.length})` : ''}
          </Text>
        </Pressable>
      </View>

      {activeTab === 'generated' ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.dressCodeScroll}
            contentContainerStyle={styles.dressCodeContent}
          >
            {DRESS_CODES.map((code) => (
              <Pressable
                key={code}
                style={[
                  styles.pill,
                  { borderColor: c.borderStrong },
                  dressCode === code && styles.pillActive,
                ]}
                onPress={() => setDressCode(code)}
              >
                <Text style={[
                  styles.pillText,
                  { color: c.textSecondary },
                  dressCode === code && styles.pillTextActive,
                ]}>
                  {code}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Pressable
            style={[styles.generateBtn, generating && styles.generateBtnDisabled]}
            onPress={() => generate(closetItems, preferences, weather, dressCode, likedOutfitsCache)}
            disabled={generating}
          >
            <Text style={styles.generateBtnText}>
              {generating ? 'Generating...' : 'Generate Outfits'}
            </Text>
          </Pressable>

          {generating ? (
            <View style={[styles.center, { backgroundColor: c.background }]}>
              <ActivityIndicator />
              <Text style={[styles.centerText, { color: c.textSecondary }]}>Claude is styling your outfits...</Text>
            </View>
          ) : generateError ? (
            <View style={[styles.center, { backgroundColor: c.background }]}>
              <Text style={styles.errorTitle}>Generation Failed</Text>
              <Text style={[styles.centerText, { color: c.textSecondary }]}>{generateError}</Text>
              <Pressable
                style={styles.retryBtn}
                onPress={() => generate(closetItems, preferences, weather, dressCode, likedOutfitsCache)}
              >
                <Text style={styles.retryBtnText}>Try Again</Text>
              </Pressable>
            </View>
          ) : suggestions.length === 0 ? (
            <View style={[styles.center, { backgroundColor: c.background }]}>
              <Text style={[styles.centerText, { color: c.textSecondary }]}>Tap Generate Outfits to get started.</Text>
            </View>
          ) : (
            <FlatList
              data={suggestions}
              keyExtractor={(item) => item.id}
              renderItem={({ item, index }) => (
                <OutfitCard
                  suggestion={item}
                  idx={index}
                  saved={savedSignatures.has(outfitSignature(item))}
                  onSave={handleSave}
                  onUnsave={handleUnsave}
                  onWear={handleWear}
                  colors={c}
                />
              )}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            />
          )}
        </>
      ) : (
        <>
          {uniqueSavedOutfits.length === 0 ? (
            <View style={[styles.center, { backgroundColor: c.background }]}>
              <Ionicons name="bookmark-outline" size={48} color={c.border} />
              <Text style={[styles.emptyTitle, { color: c.text }]}>No saved outfits yet</Text>
              <Text style={[styles.centerText, { color: c.textSecondary }]}>
                Tap the bookmark icon on any generated outfit to save it here.
              </Text>
            </View>
          ) : (
            <>
              {uniqueSavedOutfits.length >= 2 ? (
                <Pressable
                  style={[styles.compareBtn, { borderColor: c.borderStrong }]}
                  onPress={() => navigation.navigate('OutfitCompare')}
                >
                  <Ionicons name="git-compare-outline" size={16} color={c.text} />
                  <Text style={[styles.compareBtnText, { color: c.text }]}>Compare & Rate Outfits</Text>
                </Pressable>
              ) : (
                <View style={[styles.compareBtn, styles.compareBtnDisabled, { borderColor: c.border }]}>
                  <Ionicons name="git-compare-outline" size={16} color={c.textMuted} />
                  <Text style={[styles.compareBtnText, { color: c.textMuted }]}>
                    Save 2+ outfits to compare
                  </Text>
                </View>
              )}
              <FlatList
                data={uniqueSavedOutfits}
                keyExtractor={(item) => item.id}
                renderItem={({ item, index }) => (
                  <>
                    <OutfitCard
                      suggestion={item}
                      idx={index}
                      saved
                      rating={ratingsMap[item.id]}
                      onSave={handleSave}
                      onUnsave={handleUnsave}
                      onWear={handleWear}
                      colors={c}
                    />
                    <Pressable
                      style={[styles.addToCollectionBtn, { borderColor: c.border, backgroundColor: c.surface }]}
                      onPress={() => setCollectionPicker(item)}
                    >
                      <Ionicons name="albums-outline" size={14} color={c.textSecondary} />
                      <Text style={[styles.addToCollectionText, { color: c.textSecondary }]}>Add to collection</Text>
                    </Pressable>
                  </>
                )}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              />
            </>
          )}
        </>
      )}
      {/* Collection picker modal */}
      <Modal visible={!!collectionPicker} animationType="slide" transparent>
        <View style={styles.collPickerBackdrop}>
          <View style={[styles.collPickerSheet, { backgroundColor: c.background }]}>
            <View style={[styles.collPickerHeader, { borderBottomColor: c.border }]}>
              <Text style={[styles.collPickerTitle, { color: c.text }]}>Add to collection</Text>
              <Pressable onPress={() => setCollectionPicker(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color={c.text} />
              </Pressable>
            </View>
            {collections.length === 0 ? (
              <Text style={[styles.collPickerEmpty, { color: c.textMuted }]}>
                No collections yet — create one from the My Closet tab.
              </Text>
            ) : (
              <FlatList
                data={collections}
                keyExtractor={(col) => col.id}
                contentContainerStyle={{ padding: 16, gap: 10 }}
                renderItem={({ item: col }) => (
                  <Pressable
                    style={[styles.collPickerRow, { backgroundColor: c.surface, borderColor: c.border }]}
                    onPress={async () => {
                      await addOutfitToCollection(col.id, collectionPicker.id).catch(() => {});
                      setCollections((prev) => prev.map((c2) =>
                        c2.id === col.id
                          ? { ...c2, outfitIds: [...new Set([...(c2.outfitIds || []), collectionPicker.id])] }
                          : c2
                      ));
                      setCollectionPicker(null);
                      Alert.alert('Added', `"${collectionPicker.name}" added to "${col.name}".`);
                    }}
                  >
                    <Ionicons name="albums-outline" size={20} color={c.textMuted} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.collPickerName, { color: c.text }]}>{col.name}</Text>
                      <Text style={[styles.collPickerCount, { color: c.textMuted }]}>
                        {(col.outfitIds || []).length} outfit{(col.outfitIds || []).length !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
                  </Pressable>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Post-wear rating modal */}
      <Modal visible={!!ratingOutfit} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: c.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: c.text }]}>Rate this outfit</Text>
              <Pressable onPress={() => setRatingOutfit(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color={c.textMuted} />
              </Pressable>
            </View>
            <Text style={[styles.ratingName, { color: c.textSecondary }]} numberOfLines={1}>
              {ratingOutfit?.name}
            </Text>
            <Text style={[styles.ratingPrompt, { color: c.textMuted }]}>
              How did you feel wearing this today?
            </Text>
            <View style={styles.ratingGrid}>
              {[1,2,3,4,5,6,7,8,9,10].map((n) => {
                const col = n >= 9 ? '#f59e0b' : n >= 7 ? '#10b981' : n >= 5 ? '#3b82f6' : '#ef4444';
                return (
                  <Pressable
                    key={n}
                    style={[styles.ratingBtn, { backgroundColor: col + '18', borderColor: col }]}
                    onPress={() => handleSubmitRating(n)}
                  >
                    <Text style={[styles.ratingBtnNum, { color: col }]}>{n}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable style={styles.ratingSkip} onPress={() => setRatingOutfit(null)}>
              <Text style={[styles.ratingSkipText, { color: c.textMuted }]}>Skip for now</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Location modal */}
      <Modal visible={showLocationModal} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowLocationModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: c.background }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: c.text }]}>Set Location</Text>
              <Pressable onPress={() => setShowLocationModal(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={c.textMuted} />
              </Pressable>
            </View>
            <Text style={[styles.locationHint, { color: c.textMuted }]}>
              Enter a city to get local weather and tailored outfit suggestions for that location.
            </Text>
            <TextInput
              style={[styles.locationInput, { backgroundColor: c.inputBg, borderColor: c.borderStrong, color: c.text }]}
              placeholder="e.g. Tokyo, Miami, London"
              placeholderTextColor={c.placeholder}
              value={locationInput}
              onChangeText={setLocationInput}
              returnKeyType="done"
              onSubmitEditing={() => locationInput.trim() && handleSetLocation(locationInput.trim())}
              autoCapitalize="words"
              autoFocus
            />
            <Pressable
              style={[styles.locationConfirmBtn, !locationInput.trim() && { backgroundColor: '#999' }]}
              onPress={() => locationInput.trim() && handleSetLocation(locationInput.trim())}
              disabled={!locationInput.trim()}
            >
              <Text style={styles.locationConfirmText}>Use This Location</Text>
            </Pressable>
            {locationOverride && (
              <Pressable style={[styles.locationClearBtn, { borderColor: c.borderStrong }]} onPress={handleClearLocation}>
                <Ionicons name="navigate-outline" size={15} color={c.textSecondary} />
                <Text style={[styles.locationClearText, { color: c.textSecondary }]}>Reset to My Location</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 22, fontWeight: '800' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ratingName:     { fontSize: 15, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  ratingPrompt:   { fontSize: 13, marginBottom: 18, textAlign: 'center' },
  ratingGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 16 },
  ratingBtn:      { width: 54, height: 54, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  ratingBtnNum:   { fontSize: 20, fontWeight: '800' },
  ratingSkip:     { alignItems: 'center', paddingVertical: 8 },
  ratingSkipText: { fontSize: 13, fontWeight: '600' },
  locationBar: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'center', borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5, marginBottom: 6,
  },
  locationLabel: { fontSize: 13, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  locationHint: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  locationInput: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, marginBottom: 14,
  },
  locationConfirmBtn: {
    backgroundColor: '#111', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 10,
  },
  locationConfirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  locationClearBtn: {
    borderWidth: 1, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 8,
  },
  locationClearText: { fontSize: 14, fontWeight: '600' },
  weatherBadge: {
    fontSize: 14,
    fontWeight: '700',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    borderRadius: 10,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 14, fontWeight: '600' },
  dressCodeScroll: { height: 56, marginTop: 4 },
  dressCodeContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  pill: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  pillActive: { borderColor: '#111', backgroundColor: '#111' },
  pillText: { fontSize: 13, fontWeight: '600' },
  pillTextActive: { color: '#fff' },
  generateBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  generateBtnDisabled: { backgroundColor: '#999' },
  generateBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', flex: 1, marginRight: 8 },
  cardDesc: { fontSize: 13, marginBottom: 10, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  thumbWrap: {
    width: 46, height: 46, borderRadius: 8,
    overflow: 'hidden',
  },
  thumb: { width: '100%', height: '100%' },
  rowText: { marginLeft: 10, flex: 1 },
  rowLabel: { fontSize: 12, fontWeight: '600' },
  rowValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24,
  },
  centerText: { marginTop: 8, textAlign: 'center', fontSize: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  errorTitle: { fontSize: 18, fontWeight: '800', color: '#8a1111', textAlign: 'center' },
  retryBtn: {
    marginTop: 12, backgroundColor: '#111',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9,
  },
  retryBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  wornBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 10, alignSelf: 'flex-start',
    borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  wornBtnText: { fontSize: 12, fontWeight: '600' },
  saveIconBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  saveIconLabel: { fontSize: 11, fontWeight: '700' },
  scorePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  scorePillText: { fontSize: 11, fontWeight: '800' },
  compareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderWidth: 1.5, borderRadius: 12, paddingVertical: 11,
    marginHorizontal: 16, marginTop: 8, marginBottom: 4,
  },
  compareBtnText: { fontSize: 14, fontWeight: '700' },
  compareBtnDisabled: { opacity: 0.5 },
  attributionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
    marginBottom: 6, alignSelf: 'flex-start',
  },
  attributionText: { fontSize: 11, fontWeight: '600' },

  addToCollectionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
    marginHorizontal: 16, marginBottom: 16, marginTop: -8,
  },
  addToCollectionText: { fontSize: 13, fontWeight: '600' },

  collPickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  collPickerSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '65%' },
  collPickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1,
  },
  collPickerTitle: { fontSize: 17, fontWeight: '800' },
  collPickerEmpty: { padding: 32, textAlign: 'center', fontSize: 14, lineHeight: 20 },
  collPickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 12, padding: 14,
  },
  collPickerName: { fontSize: 15, fontWeight: '700' },
  collPickerCount: { fontSize: 12, marginTop: 1 },
});
