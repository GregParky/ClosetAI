import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Image,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { getUserCloset, getUserPreferences } from '../firebase/firestoreService';

function normalizeType(item) {
  const category = String(item.category || '').toLowerCase();
  const type = String(item.type || '').toLowerCase();
  const label = `${category} ${type}`;

  if (category === 'tops' || type === 'top' || label.includes('shirt') || label.includes('top')) {
    return 'top';
  }
  if (
    category === 'bottoms' ||
    type === 'bottom' ||
    label.includes('pant') ||
    label.includes('jean') ||
    label.includes('short')
  ) {
    return 'bottom';
  }
  if (
    category === 'footwear' ||
    type === 'shoes' ||
    label.includes('shoe') ||
    label.includes('sneaker') ||
    label.includes('boot')
  ) {
    return 'shoes';
  }
  if (
    category === 'outerwear' ||
    type === 'layer' ||
    label.includes('jacket') ||
    label.includes('coat') ||
    label.includes('hoodie')
  ) {
    return 'layer';
  }
  if (category === 'one_piece' || label.includes('dress') || label.includes('jumpsuit')) {
    return 'one_piece';
  }
  return 'other';
}

function pickRandom(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildSuggestion(closetItems, preferences = {}, indexSeed = 0) {
  const typed = closetItems.map((item) => ({
    ...item,
    name: item.name || item.type || item.category || 'Closet item',
    normalizedType: normalizeType(item),
  }));

  const tops = typed.filter((item) => item.normalizedType === 'top');
  const bottoms = typed.filter((item) => item.normalizedType === 'bottom');
  const shoes = typed.filter((item) => item.normalizedType === 'shoes');
  const layers = typed.filter((item) => item.normalizedType === 'layer');
  const onePieces = typed.filter((item) => item.normalizedType === 'one_piece');

  if (shoes.length === 0) return null;
  if ((tops.length === 0 || bottoms.length === 0) && onePieces.length === 0) return null;

  const preferCasual = Boolean(preferences?.preferCasual);
  const avoidDenimOnDenim = Boolean(preferences?.avoidDenimOnDenim);

  const styleFilter = (item) => {
    if (!preferCasual) return true;
    return String(item.style || '').toLowerCase().includes('casual');
  };

  const rotatePick = (arr, offset) => {
    if (!arr || arr.length === 0) return null;
    return arr[offset % arr.length];
  };

  const filteredTops = tops.filter(styleFilter);
  const filteredBottoms = bottoms.filter(styleFilter);
  const filteredShoes = shoes.filter(styleFilter);
  const filteredLayers = layers.filter(styleFilter);
  const filteredOnePieces = onePieces.filter(styleFilter);

  const useOnePiece = filteredOnePieces.length > 0 && (filteredTops.length === 0 || indexSeed % 3 === 0);

  let top = null;
  let bottom = null;
  let onePiece = null;

  if (useOnePiece) {
    onePiece = rotatePick(filteredOnePieces, indexSeed) || pickRandom(onePieces);
  } else {
    top = rotatePick(filteredTops, indexSeed) || pickRandom(tops);
    bottom = rotatePick(filteredBottoms, indexSeed + 1) || pickRandom(bottoms);
  }

  let shoe = rotatePick(filteredShoes, indexSeed + 2) || pickRandom(shoes);
  let layer = rotatePick(filteredLayers, indexSeed + 3) || pickRandom(layers);

  if (avoidDenimOnDenim && top && bottom) {
    const isTopDenim = String(top.name || top.type || '').toLowerCase().includes('denim');
    const isBottomDenim = String(bottom.name || bottom.type || '').toLowerCase().includes('denim');
    if (isTopDenim && isBottomDenim) {
      bottom = bottoms.find(
        (item) => !String(item.name || item.type || '').toLowerCase().includes('denim')
      ) || bottom;
    }
  }

  if (!shoe) return null;
  if (!onePiece && (!top || !bottom)) return null;

  return {
    id: `s-${indexSeed}-${Date.now()}`,
    top,
    bottom,
    onePiece,
    shoes: shoe,
    layer,
  };
}

function OutfitCard({ suggestion, idx }) {
  const rows = [];
  if (suggestion.onePiece) rows.push({ label: 'One Piece', item: suggestion.onePiece });
  if (suggestion.top) rows.push({ label: 'Top', item: suggestion.top });
  if (suggestion.bottom) rows.push({ label: 'Bottom', item: suggestion.bottom });
  if (suggestion.layer) rows.push({ label: 'Layer', item: suggestion.layer });
  rows.push({ label: 'Shoes', item: suggestion.shoes });

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Suggestion {idx + 1}</Text>
      {rows.map((row) => (
        <View key={`${suggestion.id}-${row.label}`} style={styles.row}>
          <View style={styles.thumbWrap}>
            {row.item?.imageUrl ? (
              <Image source={{ uri: row.item.imageUrl }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbFallback]} />
            )}
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={styles.rowValue}>
              {row.item?.name || row.item?.type || row.item?.category || 'Closet item'}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function OutfitScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [closetItems, setClosetItems] = useState([]);
  const [preferences, setPreferences] = useState({});
  const [seed, setSeed] = useState(0);

  const loadData = useCallback(async () => {
    if (!user?.uid) {
      setClosetItems([]);
      setPreferences({});
      setLoading(false);
      setLoadError('');
      return;
    }

    setLoading(true);
    setLoadError('');
    try {
      const [items, prefs] = await Promise.all([getUserCloset(user.uid), getUserPreferences(user.uid)]);
      setClosetItems(Array.isArray(items) ? items : []);
      setPreferences(prefs || {});
    } catch (err) {
      console.error('Outfit load failed:', err);
      setClosetItems([]);
      setPreferences({});
      setLoadError('Could not load closet data for outfit generation.');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    if (!user?.uid) return;
    setRefreshing(true);
    try {
      const [items, prefs] = await Promise.all([getUserCloset(user.uid), getUserPreferences(user.uid)]);
      setClosetItems(Array.isArray(items) ? items : []);
      setPreferences(prefs || {});
      setSeed((prev) => prev + 1);
    } catch (err) {
      console.error('Outfit refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  }, [user?.uid]);

  const suggestions = useMemo(() => {
    const out = [];
    for (let i = 0; i < 3; i += 1) {
      const suggestion = buildSuggestion(closetItems, preferences, seed + i);
      if (suggestion) out.push(suggestion);
    }
    return out;
  }, [closetItems, preferences, seed]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.centerText}>Generating outfit suggestions...</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Outfit Suggestions Unavailable</Text>
        <Text style={styles.centerText}>{loadError}</Text>
        <Pressable style={styles.retryBtn} onPress={loadData}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (suggestions.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Need more items for outfit AI</Text>
        <Text style={styles.centerText}>
          Add at least shoes plus either tops and bottoms, or a one-piece item in My Closet.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>AI Outfit Suggestions</Text>
        <Pressable style={styles.button} onPress={() => setSeed((prev) => prev + 3)}>
          <Text style={styles.buttonText}>Refresh</Text>
        </Pressable>
      </View>
      <FlatList
        data={suggestions}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => <OutfitCard suggestion={item} idx={index} />}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  headerRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    borderWidth: 1,
    borderColor: '#ececec',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#fafafa',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  thumbWrap: {
    width: 46,
    height: 46,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#eee',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    backgroundColor: '#e5e5e5',
  },
  rowText: {
    marginLeft: 10,
    flex: 1,
  },
  rowLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  rowValue: {
    fontSize: 14,
    color: '#111',
    fontWeight: '700',
    marginTop: 2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#fff',
  },
  centerText: {
    marginTop: 8,
    textAlign: 'center',
    color: '#444',
    fontSize: 14,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111',
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#8a1111',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: '#111',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
