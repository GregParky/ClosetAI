import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import { getDiscoverFeed } from '../firebase/firestoreService';

const FALLBACK_EXPLORE = [
  { id: 'f-1', kind: 'outfit', imageUrl: 'https://picsum.photos/seed/closet-1/800/800', title: 'Street fit', subtitle: '@styledaily' },
  { id: 'f-2', kind: 'trend', imageUrl: 'https://picsum.photos/seed/closet-2/800/800', title: 'Neutral layers', subtitle: 'Trending' },
  { id: 'f-3', kind: 'partner', imageUrl: 'https://picsum.photos/seed/closet-3/800/800', title: 'Sneaker drop', subtitle: 'Sponsored' },
  { id: 'f-4', kind: 'outfit', imageUrl: 'https://picsum.photos/seed/closet-4/800/800', title: 'Office capsule', subtitle: '@dailylooks' },
  { id: 'f-5', kind: 'trend', imageUrl: 'https://picsum.photos/seed/closet-5/800/800', title: 'Weekend denim', subtitle: 'Trending' },
  { id: 'f-6', kind: 'partner', imageUrl: 'https://picsum.photos/seed/closet-6/800/800', title: 'Partner picks', subtitle: 'Sponsored' },
  { id: 'f-7', kind: 'outfit', imageUrl: 'https://picsum.photos/seed/closet-7/800/800', title: 'Airport fit', subtitle: '@minwear' },
  { id: 'f-8', kind: 'trend', imageUrl: 'https://picsum.photos/seed/closet-8/800/800', title: 'Layer game', subtitle: 'Trending' },
  { id: 'f-9', kind: 'outfit', imageUrl: 'https://picsum.photos/seed/closet-9/800/800', title: 'Color block', subtitle: '@fitjournal' },
];

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'outfit', label: 'Outfits' },
  { key: 'trend', label: 'Trending' },
  { key: 'partner', label: 'Partners' },
];
const PAGE_SIZE = 15;
const MIN_DISCOVER_ITEMS = PAGE_SIZE * 3;

function ensureMinItems(items, min = MIN_DISCOVER_ITEMS) {
  const base = Array.isArray(items) ? [...items] : [];
  if (base.length >= min) return base;
  const needed = min - base.length;
  for (let i = 0; i < needed; i += 1) {
    const seed = FALLBACK_EXPLORE[i % FALLBACK_EXPLORE.length];
    base.push({
      ...seed,
      id: `fallback-${seed.id}-${i}`,
    });
  }
  return base;
}

function exploreMatches(item, q) {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  const haystack = `${item.title || ''} ${item.subtitle || ''} ${item.kind || ''}`.toLowerCase();
  return haystack.includes(needle);
}

function isNearBottom(nativeEvent, threshold = 160) {
  const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
  return contentSize.height - (contentOffset.y + layoutMeasurement.height) <= threshold;
}

export default function DiscoverScreen() {
  const initialVisibleCount = PAGE_SIZE;
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [feedItems, setFeedItems] = useState([]);
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount);
  const isPaginatingRef = useRef(false);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const items = await getDiscoverFeed(user?.uid, 180);
      setFeedItems(ensureMinItems(items.length > 0 ? items : FALLBACK_EXPLORE));
    } catch (err) {
      console.error('discover feed load failed:', err);
      setFeedItems(ensureMinItems(FALLBACK_EXPLORE));
      setLoadError('Could not load latest discover feed. Showing fallback content.');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const items = await getDiscoverFeed(user?.uid, 180);
      setFeedItems(ensureMinItems(items.length > 0 ? items : FALLBACK_EXPLORE));
      setVisibleCount(initialVisibleCount);
    } catch (err) {
      console.error('discover refresh failed:', err);
      setFeedItems((prev) => (prev.length > 0 ? ensureMinItems(prev) : ensureMinItems(FALLBACK_EXPLORE)));
    } finally {
      setRefreshing(false);
    }
  }, [initialVisibleCount, user?.uid]);

  const filteredFeed = useMemo(() => {
    const byType =
      activeFilter === 'all' ? feedItems : feedItems.filter((item) => item.kind === activeFilter);
    return byType.filter((item) => exploreMatches(item, query));
  }, [activeFilter, feedItems, query]);

  useEffect(() => {
    setVisibleCount(initialVisibleCount);
  }, [initialVisibleCount]);

  useEffect(() => {
    setVisibleCount(initialVisibleCount);
  }, [activeFilter, initialVisibleCount, query]);

  const visibleFeed = useMemo(
    () => filteredFeed.slice(0, Math.min(visibleCount, filteredFeed.length)),
    [filteredFeed, visibleCount]
  );

  const loadNextPage = useCallback(() => {
    if (isPaginatingRef.current || visibleCount >= filteredFeed.length) return;
    isPaginatingRef.current = true;
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredFeed.length));
  }, [filteredFeed.length, visibleCount]);

  const handleEndReached = useCallback(() => {
    loadNextPage();
  }, [loadNextPage]);

  const handleScroll = useCallback(
    ({ nativeEvent }) => {
      if (isNearBottom(nativeEvent)) {
        loadNextPage();
      }
    },
    [loadNextPage]
  );

  const handleScrollEnd = useCallback(
    ({ nativeEvent }) => {
      if (isNearBottom(nativeEvent)) {
        loadNextPage();
      }
    },
    [loadNextPage]
  );

  useEffect(() => {
    isPaginatingRef.current = false;
  }, [visibleCount, filteredFeed.length]);

  const renderTile = ({ item }) => {
    return (
      <Pressable style={styles.tile}>
        <Image source={{ uri: item.imageUrl }} style={styles.tileImage} />
        <View style={styles.tileBadge}>
          <Text style={styles.tileBadgeText}>
            {item.kind === 'partner' ? 'Partner' : item.kind === 'trend' ? 'Trending' : 'Outfit'}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.topControls}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color="#666" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search profiles, outfits, inspiration..."
            placeholderTextColor="#888"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
            returnKeyType="search"
          />
        </View>
        <View style={styles.filterRow}>
          {FILTERS.map((filter) => {
            const isActive = activeFilter === filter.key;
            return (
              <Pressable
                key={filter.key}
                onPress={() => setActiveFilter(filter.key)}
                style={[styles.filterChip, isActive ? styles.filterChipActive : null]}
              >
                <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator />
          <Text style={styles.centerText}>Loading explore feed...</Text>
        </View>
      ) : (
        <>
          {loadError ? (
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>{loadError}</Text>
            </View>
          ) : null}
          <FlatList
            data={visibleFeed}
            keyExtractor={(item) => item.id}
            numColumns={3}
            style={styles.feedList}
            contentContainerStyle={styles.gridContent}
            initialNumToRender={initialVisibleCount}
            extraData={visibleCount}
            keyboardShouldPersistTaps="handled"
            onRefresh={onRefresh}
            refreshing={refreshing}
            renderItem={renderTile}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            onScroll={handleScroll}
            onMomentumScrollEnd={handleScrollEnd}
            onScrollEndDrag={handleScrollEnd}
            scrollEventThrottle={16}
            ListFooterComponent={
              visibleCount < filteredFeed.length ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.centerState}>
                <Text style={styles.centerText}>No explore results for "{query}"</Text>
              </View>
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 14,
  },
  topControls: {
    paddingHorizontal: 16,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e6e6e6',
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: '#111',
  },
  filterRow: {
    flexDirection: 'row',
    marginTop: 10,
    marginBottom: 10,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e2e2',
    backgroundColor: '#f8f8f8',
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#111',
    borderColor: '#111',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  feedList: {
    flex: 1,
  },
  gridContent: {
    paddingBottom: 24,
    flexGrow: 1,
  },
  tile: {
    width: '33.3333%',
    aspectRatio: 1,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#efefef',
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  tileBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.60)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tileBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  centerText: {
    marginTop: 8,
    fontSize: 14,
    color: '#111',
  },
  warningBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
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
  footerLoader: {
    paddingVertical: 14,
  },
});
