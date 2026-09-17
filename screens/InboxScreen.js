import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, FlatList,
  ActivityIndicator, Pressable, Image, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../context/ThemeContext';
import { getUserCloset, getSavedOutfits, getWearLogs, getPendingFollowRequests, getUserProfile, acceptFollowRequest, declineFollowRequest } from '../firebase/firestoreService';
import { analyzeWardrobeGaps } from '../services/aiPackingService';

const CATEGORIES = [
  { key: 'tops', label: 'Tops' },
  { key: 'bottoms', label: 'Bottoms' },
  { key: 'outerwear', label: 'Outerwear' },
  { key: 'footwear', label: 'Footwear' },
  { key: 'one_piece', label: 'One Piece' },
  { key: 'accessories', label: 'Accessories' },
];

const PRIORITY_COLOR = { high: '#e0374a', medium: '#f59e0b', low: '#6b7280' };

function StatPill({ label, value, colors: c }) {
  return (
    <View style={[styles.statPill, { backgroundColor: c.surfaceAlt }]}>
      <Text style={[styles.statValue, { color: c.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: c.textMuted }]}>{label}</Text>
    </View>
  );
}

function SavedOutfitRow({ outfit, colors: c }) {
  const navigation = useNavigation();
  const items = [outfit.top, outfit.bottom, outfit.onePiece, outfit.layer, outfit.shoes]
    .filter(Boolean)
    .slice(0, 3);

  return (
    <Pressable style={[styles.outfitRow, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => navigation.navigate('Outfit')}>
      <View style={styles.outfitThumbs}>
        {items.map((item, i) =>
          item?.imageUrl ? (
            <Image key={i} source={{ uri: item.imageUrl }} style={styles.outfitThumb} />
          ) : (
            <View key={i} style={[styles.outfitThumb, { backgroundColor: c.surfaceAlt }]} />
          )
        )}
      </View>
      <View style={styles.outfitInfo}>
        <Text style={[styles.outfitName, { color: c.text }]} numberOfLines={1}>{outfit.name || 'Saved Outfit'}</Text>
        {outfit.description ? (
          <Text style={[styles.outfitDesc, { color: c.textSecondary }]} numberOfLines={2}>{outfit.description}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function GapCard({ gap, colors: c }) {
  return (
    <View style={[styles.gapCard, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.gapHeader}>
        <Text style={[styles.gapItem, { color: c.text }]}>{gap.item}</Text>
        <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_COLOR[gap.priority] + '22' }]}>
          <Text style={[styles.priorityText, { color: PRIORITY_COLOR[gap.priority] }]}>
            {gap.priority}
          </Text>
        </View>
      </View>
      <Text style={[styles.gapReason, { color: c.textSecondary }]}>{gap.reason}</Text>
    </View>
  );
}

export default function InboxScreen() {
  const { user } = useAuth();
  const c = useColors();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [closetItems, setClosetItems] = useState([]);
  const [savedOutfits, setSavedOutfits] = useState([]);
  const [wearLogs, setWearLogs] = useState([]);
  const [gaps, setGaps] = useState(null);
  const [analyzingGaps, setAnalyzingGaps] = useState(false);
  const [followRequests, setFollowRequests] = useState([]);
  const [requestProfiles, setRequestProfiles] = useState({});

  const loadData = useCallback(async () => {
    if (!user?.uid) { setLoading(false); return; }
    try {
      const [items, saved, logs, requests] = await Promise.all([
        getUserCloset(user.uid),
        getSavedOutfits(user.uid),
        getWearLogs(user.uid, 30),
        getPendingFollowRequests(user.uid),
      ]);
      setClosetItems(Array.isArray(items) ? items : []);
      setSavedOutfits(Array.isArray(saved) ? saved : []);
      setWearLogs(Array.isArray(logs) ? logs : []);
      setFollowRequests(Array.isArray(requests) ? requests : []);
      // Load requester profiles
      const profiles = {};
      await Promise.all(
        (requests || []).map(async (req) => {
          const prof = await getUserProfile(req.followerId).catch(() => null);
          if (prof) profiles[req.followerId] = prof;
        })
      );
      setRequestProfiles(profiles);
    } catch (err) {
      console.error('Activity load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { loadData(); }, [loadData]);

  // Reload whenever this tab comes into focus (catches account switches + returning from other screens)
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleAccept = useCallback(async (followerId) => {
    try {
      await acceptFollowRequest(followerId, user.uid);
      setFollowRequests((prev) => prev.filter((r) => r.followerId !== followerId));
    } catch (err) {
      console.error('Accept failed:', err);
    }
  }, [user?.uid]);

  const handleDecline = useCallback(async (followerId) => {
    try {
      await declineFollowRequest(followerId, user.uid);
      setFollowRequests((prev) => prev.filter((r) => r.followerId !== followerId));
    } catch (err) {
      console.error('Decline failed:', err);
    }
  }, [user?.uid]);

  const handleAnalyzeGaps = useCallback(async () => {
    if (!closetItems.length) {
      Alert.alert('Add items first', 'Add some clothing to your closet before analyzing gaps.');
      return;
    }
    setAnalyzingGaps(true);
    try {
      const result = await analyzeWardrobeGaps({ closetItems });
      setGaps(result.gaps || []);
    } catch (err) {
      console.error('Gap analysis failed:', err);
      Alert.alert('Analysis failed', 'Could not analyze your wardrobe. Try again.');
    } finally {
      setAnalyzingGaps(false);
    }
  }, [closetItems]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  // Wear stats
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const wornThisWeek = wearLogs.filter((log) => {
    const wornAt = log.wornAt?.toDate ? log.wornAt.toDate() : new Date(log.wornAt || 0);
    return wornAt >= weekAgo;
  }).length;

  // Most worn outfit
  const wearCounts = {};
  for (const log of wearLogs) {
    if (log.outfitName) wearCounts[log.outfitName] = (wearCounts[log.outfitName] || 0) + 1;
  }
  const mostWorn = Object.entries(wearCounts).sort((a, b) => b[1] - a[1])[0];

  const categoryCounts = CATEGORIES.map((cat) => ({
    ...cat,
    count: closetItems.filter((item) => item.category === cat.key).length,
  })).filter((cat) => cat.count > 0);

  return (
    <FlatList
      style={[styles.container, { backgroundColor: c.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <>
          <Text style={[styles.header, { color: c.text }]}>Activity</Text>

          {/* Follow requests */}
          {followRequests.length > 0 && (
            <>
              <View style={styles.sectionRow}>
                <Text style={[styles.sectionTitle, { color: c.text }]}>Follow Requests</Text>
                <View style={[styles.requestBadge, { backgroundColor: '#e0374a' }]}>
                  <Text style={styles.requestBadgeText}>{followRequests.length}</Text>
                </View>
              </View>
              {followRequests.map((req) => {
                const prof = requestProfiles[req.followerId];
                const name = prof?.displayName || 'Someone';
                const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <View key={req.id} style={[styles.requestRow, { backgroundColor: c.surface, borderColor: c.border }]}>
                    <View style={[styles.requestAvatar, { backgroundColor: '#111' }]}>
                      <Text style={styles.requestAvatarText}>{initials}</Text>
                    </View>
                    <View style={styles.requestInfo}>
                      <Text style={[styles.requestName, { color: c.text }]}>{name}</Text>
                      <Text style={[styles.requestSub, { color: c.textMuted }]}>wants to follow you</Text>
                    </View>
                    <View style={styles.requestActions}>
                      <Pressable
                        style={[styles.requestBtn, styles.requestBtnAccept]}
                        onPress={() => handleAccept(req.followerId)}
                      >
                        <Text style={styles.requestBtnAcceptText}>Accept</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.requestBtn, { borderColor: c.borderStrong }]}
                        onPress={() => handleDecline(req.followerId)}
                      >
                        <Text style={[styles.requestBtnText, { color: c.textSecondary }]}>Decline</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </>
          )}

          {/* Closet stats */}
          <Text style={[styles.sectionTitle, { color: c.text }]}>Your Closet</Text>
          <View style={styles.statsRow}>
            <StatPill label="Total Items" value={closetItems.length} colors={c} />
            <StatPill label="Saved Outfits" value={savedOutfits.length} colors={c} />
            <StatPill label="Worn This Week" value={wornThisWeek} colors={c} />
          </View>

          {mostWorn && (
            <View style={[styles.mostWornCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Ionicons name="star" size={14} color="#f59e0b" />
              <Text style={[styles.mostWornText, { color: c.text }]}>
                Most worn: <Text style={{ fontWeight: '800' }}>{mostWorn[0]}</Text>
                <Text style={{ color: c.textMuted }}> ({mostWorn[1]}×)</Text>
              </Text>
            </View>
          )}

          {categoryCounts.length > 0 && (
            <View style={styles.categoryRow}>
              {categoryCounts.map((cat) => (
                <View key={cat.key} style={[styles.categoryChip, { backgroundColor: c.surfaceAlt }]}>
                  <Text style={[styles.categoryCount, { color: c.text }]}>{cat.count}</Text>
                  <Text style={[styles.categoryLabel, { color: c.textSecondary }]}>{cat.label}</Text>
                </View>
              ))}
            </View>
          )}
          {closetItems.length === 0 && (
            <Pressable style={[styles.emptyCard, { borderColor: c.borderStrong }]} onPress={() => navigation.navigate('MyCloset')}>
              <Text style={[styles.emptyCardTitle, { color: c.textSecondary }]}>Your closet is empty</Text>
              <Text style={[styles.emptyCardCta, { color: c.textMuted }]}>Add items to get started →</Text>
            </Pressable>
          )}

          {/* Outfit Rankings */}
          <Pressable
            style={[styles.rankingsBtn, { backgroundColor: c.surface, borderColor: c.border }]}
            onPress={() => navigation.navigate('OutfitRatings')}
          >
            <Ionicons name="trophy-outline" size={18} color="#f59e0b" />
            <View style={styles.rankingsInfo}>
              <Text style={[styles.rankingsTitle, { color: c.text }]}>My Outfit Rankings</Text>
              <Text style={[styles.rankingsSub, { color: c.textMuted }]}>
                Rate outfits after wearing them · trains your AI stylist
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
          </Pressable>

          {/* Shop the Gap */}
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>Shop the Gap</Text>
          </View>
          <Text style={[styles.sectionDesc, { color: c.textMuted }]}>
            AI identifies what your wardrobe is missing.
          </Text>
          {gaps === null && !analyzingGaps && (
            <Pressable
              style={[styles.analyzeBtn, { borderColor: c.borderStrong }]}
              onPress={handleAnalyzeGaps}
            >
              <Ionicons name="sparkles-outline" size={15} color={c.text} />
              <Text style={[styles.analyzeBtnText, { color: c.text }]}>Analyze my wardrobe</Text>
            </Pressable>
          )}
          {analyzingGaps && (
            <View style={styles.analyzingRow}>
              <ActivityIndicator size="small" />
              <Text style={[styles.analyzingText, { color: c.textMuted }]}>Analyzing your closet...</Text>
            </View>
          )}
          {gaps !== null && gaps.length === 0 && (
            <Text style={[styles.sectionDesc, { color: c.textMuted }]}>Your wardrobe looks well-rounded!</Text>
          )}

          {/* Saved outfits */}
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>Saved Outfits</Text>
            {savedOutfits.length > 0 && (
              <Pressable onPress={() => navigation.navigate('Outfit')}>
                <Text style={[styles.seeAll, { color: c.textSecondary }]}>See all</Text>
              </Pressable>
            )}
          </View>
          {savedOutfits.length === 0 && (
            <Pressable style={[styles.emptyCard, { borderColor: c.borderStrong }]} onPress={() => navigation.navigate('Outfit')}>
              <Text style={[styles.emptyCardTitle, { color: c.textSecondary }]}>No saved outfits yet</Text>
              <Text style={[styles.emptyCardCta, { color: c.textMuted }]}>Generate and heart an outfit →</Text>
            </Pressable>
          )}
        </>
      }
      data={[
        ...(gaps !== null ? gaps.map((g, i) => ({ _type: 'gap', ...g, _key: `gap-${i}` })) : []),
        ...savedOutfits.slice(0, 5).map((o) => ({ _type: 'outfit', ...o, _key: `outfit-${o.id}` })),
      ]}
      keyExtractor={(item) => item._key}
      renderItem={({ item }) => {
        if (item._type === 'gap') return <GapCard gap={item} colors={c} />;
        return <SavedOutfitRow outfit={item} colors={c} />;
      }}
      ListEmptyComponent={null}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { fontSize: 26, fontWeight: '800', marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
  sectionDesc: { fontSize: 13, marginBottom: 10 },
  sectionRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 6, marginTop: 16,
  },
  seeAll: { fontSize: 13, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statPill: {
    flex: 1, borderRadius: 14,
    padding: 12, alignItems: 'center',
  },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 2, textAlign: 'center' },
  mostWornCard: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 12,
  },
  mostWornText: { fontSize: 13 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  categoryCount: { fontSize: 14, fontWeight: '800' },
  categoryLabel: { fontSize: 13 },
  emptyCard: {
    borderWidth: 1.5, borderStyle: 'dashed',
    borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 16,
  },
  emptyCardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  emptyCardCta: { fontSize: 13 },
  analyzeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    marginBottom: 16, alignSelf: 'flex-start',
  },
  analyzeBtnText: { fontSize: 14, fontWeight: '700' },
  analyzingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  analyzingText: { fontSize: 13 },
  gapCard: {
    borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8,
  },
  gapHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  gapItem: { fontSize: 14, fontWeight: '700', flex: 1, marginRight: 8 },
  priorityBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  priorityText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  gapReason: { fontSize: 12, lineHeight: 17 },
  requestBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  requestBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  requestRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8,
  },
  requestAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  requestAvatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  requestInfo: { flex: 1 },
  requestName: { fontSize: 14, fontWeight: '700' },
  requestSub: { fontSize: 12, marginTop: 1 },
  requestActions: { flexDirection: 'row', gap: 6 },
  requestBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  requestBtnAccept: { backgroundColor: '#111', borderColor: '#111' },
  requestBtnAcceptText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  requestBtnText: { fontSize: 12, fontWeight: '700' },
  rankingsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 16,
  },
  rankingsInfo: { flex: 1 },
  rankingsTitle: { fontSize: 15, fontWeight: '700' },
  rankingsSub:   { fontSize: 12, marginTop: 2 },
  outfitRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 14,
    padding: 12, marginBottom: 10,
  },
  outfitThumbs: { flexDirection: 'row', gap: 4, marginRight: 12 },
  outfitThumb: { width: 44, height: 44, borderRadius: 8 },
  outfitInfo: { flex: 1 },
  outfitName: { fontSize: 14, fontWeight: '700' },
  outfitDesc: { fontSize: 12, marginTop: 2 },
});
