import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, Image, Alert, RefreshControl, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../context/ThemeContext';
import {
  getUserProfile,
  getFollowerCount, getFollowingCount,
  getFollowStatus,
  sendFollowRequest, cancelFollowRequest, unfollowUser,
  getSavedOutfits,
  getLikeStatuses,
  likeOutfit, unlikeOutfit,
  saveOutfitFromProfile,
} from '../firebase/firestoreService';

const AVATAR_COLORS = ['#1a1a2e', '#16213e', '#c4714f', '#2d6a4f', '#6d3a8b'];
function avatarColor(uid = '') {
  let h = 0;
  for (const ch of uid) h = (h << 5) - h + ch.charCodeAt(0);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function Avatar({ name, uid, photoURL, size = 72 }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  if (photoURL) {
    return <Image source={{ uri: photoURL }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(uid) }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

function FollowButton({ status, onPress, loading, colors: c }) {
  if (loading) return <ActivityIndicator style={{ marginVertical: 10 }} />;
  if (status === 'accepted') {
    return (
      <Pressable style={[styles.followBtn, { borderColor: c.borderStrong }]} onPress={onPress}>
        <Ionicons name="checkmark" size={14} color={c.text} />
        <Text style={[styles.followBtnText, { color: c.text }]}>Following</Text>
      </Pressable>
    );
  }
  if (status === 'pending') {
    return (
      <Pressable style={[styles.followBtn, { borderColor: c.borderStrong }]} onPress={onPress}>
        <Ionicons name="time-outline" size={14} color={c.textSecondary} />
        <Text style={[styles.followBtnText, { color: c.textSecondary }]}>Requested</Text>
      </Pressable>
    );
  }
  return (
    <Pressable style={[styles.followBtn, styles.followBtnPrimary]} onPress={onPress}>
      <Ionicons name="person-add-outline" size={14} color="#fff" />
      <Text style={[styles.followBtnText, { color: '#fff' }]}>Follow</Text>
    </Pressable>
  );
}

// ─── Outfit detail modal ──────────────────────────────────────────────────────

function OutfitDetailModal({ outfit, liked, saving, onLike, onSave, onClose, colors: c }) {
  if (!outfit) return null;
  const rows = [];
  if (outfit.onePiece) rows.push({ label: 'One Piece', item: outfit.onePiece });
  if (outfit.top)      rows.push({ label: 'Top',      item: outfit.top });
  if (outfit.bottom)   rows.push({ label: 'Bottom',   item: outfit.bottom });
  if (outfit.layer)    rows.push({ label: 'Layer',     item: outfit.layer });
  if (outfit.shoes)    rows.push({ label: 'Shoes',     item: outfit.shoes });

  return (
    <Modal visible animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: c.background }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={[styles.modalName, { color: c.text }]} numberOfLines={1}>{outfit.name}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={c.textMuted} />
            </Pressable>
          </View>

          {outfit.description ? (
            <Text style={[styles.modalDesc, { color: c.textSecondary }]}>{outfit.description}</Text>
          ) : null}

          {/* Items list */}
          <ScrollView style={styles.modalItems} showsVerticalScrollIndicator={false}>
            {rows.map((row) => (
              <View key={row.label} style={[styles.itemRow, { borderColor: c.border }]}>
                <View style={[styles.itemThumbWrap, { backgroundColor: c.surfaceAlt }]}>
                  {row.item?.imageUrl
                    ? <Image source={{ uri: row.item.imageUrl }} style={styles.itemThumb} />
                    : <Ionicons name="shirt-outline" size={22} color={c.textMuted} />}
                </View>
                <View style={styles.itemText}>
                  <Text style={[styles.itemLabel, { color: c.textMuted }]}>{row.label}</Text>
                  <Text style={[styles.itemName, { color: c.text }]} numberOfLines={1}>
                    {row.item?.name || row.item?.category || 'Item'}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Like count */}
          <Text style={[styles.likeCountLine, { color: c.textMuted }]}>
            {(outfit.likeCount || 0)} {outfit.likeCount === 1 ? 'like' : 'likes'}
          </Text>

          {/* Actions */}
          <View style={styles.modalActions}>
            <Pressable
              style={[styles.actionBtn, liked && styles.actionBtnLiked, { borderColor: liked ? '#e0374a' : c.borderStrong }]}
              onPress={onLike}
            >
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? '#e0374a' : c.text} />
              <Text style={[styles.actionBtnText, { color: liked ? '#e0374a' : c.text }]}>
                {liked ? 'Liked' : 'Like'}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.actionBtn, styles.actionBtnSave]}
              onPress={onSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Ionicons name="bookmark-outline" size={18} color="#fff" />
                    <Text style={[styles.actionBtnText, { color: '#fff' }]}>Save Outfit</Text>
                  </>}
            </Pressable>
          </View>

          <View style={styles.hintRow}>
            <Text style={[styles.saveHint, { color: c.textMuted }]}>
              <Text style={{ color: '#e0374a', fontWeight: '700' }}>♥ Like</Text> — trains your AI stylist{'\n'}
              <Text style={{ color: '#3b82f6', fontWeight: '700' }}>🔖 Save</Text> — adds to your Outfit tab
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function OtherProfileScreen({ route, navigation: nav }) {
  const { userId } = route.params;
  const { user } = useAuth();
  const c = useColors();

  const [profile, setProfile]           = useState(null);
  const [followers, setFollowers]       = useState(0);
  const [following, setFollowing]       = useState(0);
  const [followStatus, setFollowStatus] = useState(null);
  const [outfits, setOutfits]           = useState([]);
  const [likedMap, setLikedMap]         = useState({});   // outfitId → boolean
  const [likeCounts, setLikeCounts]     = useState({});   // outfitId → number
  const [selectedOutfit, setSelectedOutfit] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [savingId, setSavingId]         = useState(null);

  const loadData = useCallback(async () => {
    if (!user?.uid || !userId) return;
    const [prof, fc, fg, fs, saved] = await Promise.all([
      getUserProfile(userId),
      getFollowerCount(userId),
      getFollowingCount(userId),
      getFollowStatus(user.uid, userId),
      getSavedOutfits(userId).catch(() => []),
    ]);
    setProfile(prof);
    setFollowers(fc);
    setFollowing(fg);
    setFollowStatus(fs);

    // Sort by most liked first
    const sorted = (Array.isArray(saved) ? saved : [])
      .filter((o) => !o.savedFrom)
      .sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
    setOutfits(sorted);

    // Initialise like counts from stored field
    const counts = {};
    sorted.forEach((o) => { counts[o.id] = o.likeCount || 0; });
    setLikeCounts(counts);

    // Load which ones the current user has liked
    if (sorted.length > 0) {
      const statuses = await getLikeStatuses(user.uid, sorted.map((o) => o.id));
      setLikedMap(statuses);
    }
    setLoading(false);
  }, [user?.uid, userId]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // ── Follow ──────────────────────────────────────────────────────────────────

  const handleFollowPress = useCallback(async () => {
    if (!user?.uid) return;
    setFollowLoading(true);
    try {
      if (followStatus === null) {
        await sendFollowRequest(user.uid, userId);
        setFollowStatus('pending');
      } else if (followStatus === 'pending') {
        Alert.alert('Cancel request?', 'Withdraw your follow request?', [
          { text: 'Keep', style: 'cancel' },
          { text: 'Cancel request', style: 'destructive', onPress: async () => {
            await cancelFollowRequest(user.uid, userId);
            setFollowStatus(null);
          }},
        ]);
      } else if (followStatus === 'accepted') {
        Alert.alert('Unfollow?', `Stop following ${profile?.displayName || 'this user'}?`, [
          { text: 'Keep following', style: 'cancel' },
          { text: 'Unfollow', style: 'destructive', onPress: async () => {
            await unfollowUser(user.uid, userId);
            setFollowStatus(null);
            setFollowers((n) => Math.max(0, n - 1));
          }},
        ]);
      }
    } catch (err) { Alert.alert('Error', err.message); }
    finally { setFollowLoading(false); }
  }, [followStatus, user?.uid, userId, profile]);

  // ── Like ────────────────────────────────────────────────────────────────────

  const handleLike = useCallback(async (outfit) => {
    if (!user?.uid) return;
    const alreadyLiked = likedMap[outfit.id];
    // Optimistic update
    setLikedMap((prev) => ({ ...prev, [outfit.id]: !alreadyLiked }));
    setLikeCounts((prev) => ({ ...prev, [outfit.id]: (prev[outfit.id] || 0) + (alreadyLiked ? -1 : 1) }));
    // Also update selectedOutfit so modal reflects the change
    setSelectedOutfit((prev) => prev ? { ...prev, likeCount: (prev.likeCount || 0) + (alreadyLiked ? -1 : 1) } : prev);
    try {
      if (alreadyLiked) {
        await unlikeOutfit(user.uid, outfit.id);
      } else {
        await likeOutfit(user.uid, outfit.id, userId, outfit.name, outfit.description);
      }
    } catch {
      // Revert
      setLikedMap((prev) => ({ ...prev, [outfit.id]: alreadyLiked }));
      setLikeCounts((prev) => ({ ...prev, [outfit.id]: (prev[outfit.id] || 0) + (alreadyLiked ? 1 : -1) }));
    }
  }, [likedMap, user?.uid, userId]);

  // ── Save from profile ───────────────────────────────────────────────────────

  const handleSave = useCallback(async (outfit) => {
    if (!user?.uid || savingId) return;
    setSavingId(outfit.id);
    try {
      await saveOutfitFromProfile(user.uid, outfit, userId, profile?.displayName || 'Someone');
      setSelectedOutfit(null);
      Alert.alert('Saved!', `"${outfit.name}" added to your saved outfits, credited to ${profile?.displayName || 'this user'}.`);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingId(null);
    }
  }, [user?.uid, userId, profile, savingId]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return <View style={[styles.center, { backgroundColor: c.background }]}><ActivityIndicator /></View>;
  }
  if (!profile) {
    return <View style={[styles.center, { backgroundColor: c.background }]}><Text style={{ color: c.textMuted }}>User not found.</Text></View>;
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Profile header */}
      <View style={styles.headerRow}>
        <Avatar name={profile.displayName} uid={userId} photoURL={profile.photoURL} />
        <View style={styles.statsRow}>
          <Pressable
            style={styles.statItem}
            hitSlop={6}
            onPress={() => nav.push('FollowList', { userId, type: 'following' })}
          >
            <Text style={[styles.statNum, { color: c.text }]}>{following}</Text>
            <Text style={[styles.statLabel, { color: c.textMuted }]}>Following</Text>
          </Pressable>
          <View style={[styles.statDivider, { backgroundColor: c.border }]} />
          <Pressable
            style={styles.statItem}
            hitSlop={6}
            onPress={() => nav.push('FollowList', { userId, type: 'followers' })}
          >
            <Text style={[styles.statNum, { color: c.text }]}>{followers}</Text>
            <Text style={[styles.statLabel, { color: c.textMuted }]}>Followers</Text>
          </Pressable>
          <View style={[styles.statDivider, { backgroundColor: c.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: c.text }]}>{outfits.length}</Text>
            <Text style={[styles.statLabel, { color: c.textMuted }]}>Outfits</Text>
          </View>
        </View>
      </View>

      <Text style={[styles.displayName, { color: c.text }]}>{profile.displayName}</Text>
      {profile.bio ? <Text style={[styles.bio, { color: c.textSecondary }]}>{profile.bio}</Text> : null}

      <FollowButton status={followStatus} onPress={handleFollowPress} loading={followLoading} colors={c} />

      {/* Outfits grid — sorted by most liked */}
      <Text style={[styles.sectionTitle, { color: c.text }]}>
        Top Outfits {outfits.length > 0 ? `(${outfits.length})` : ''}
      </Text>

      {outfits.length === 0 ? (
        <View style={[styles.emptyGrid, { borderColor: c.borderStrong }]}>
          <Ionicons name="heart-outline" size={30} color={c.border} />
          <Text style={[styles.emptyGridText, { color: c.textMuted }]}>No saved outfits yet</Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {outfits.map((outfit) => {
            const thumb = [outfit.top, outfit.onePiece, outfit.bottom, outfit.shoes]
              .filter(Boolean).find((i) => i?.imageUrl);
            const liked = likedMap[outfit.id];
            const count = likeCounts[outfit.id] || 0;
            return (
              <Pressable
                key={outfit.id}
                style={[styles.gridCell, { backgroundColor: c.surfaceAlt }]}
                onPress={() => setSelectedOutfit({ ...outfit, likeCount: count })}
              >
                {thumb?.imageUrl
                  ? <Image source={{ uri: thumb.imageUrl }} style={styles.gridImage} />
                  : <Ionicons name="shirt-outline" size={26} color={c.textMuted} />}
                {/* Like overlay badge */}
                <View style={styles.likeBadge}>
                  <Ionicons name={liked ? 'heart' : 'heart-outline'} size={11} color={liked ? '#e0374a' : '#fff'} />
                  <Text style={styles.likeBadgeCount}>{count > 0 ? count : ''}</Text>
                </View>
                <Text style={[styles.gridLabel, { color: c.text }]} numberOfLines={1}>{outfit.name}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Outfit detail modal */}
      {selectedOutfit && (
        <OutfitDetailModal
          outfit={selectedOutfit}
          liked={!!likedMap[selectedOutfit.id]}
          saving={savingId === selectedOutfit.id}
          onLike={() => handleLike(selectedOutfit)}
          onSave={() => handleSave(selectedOutfit)}
          onClose={() => setSelectedOutfit(null)}
          colors={c}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 16 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800' },
  statsRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: 26 },
  displayName: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  bio: { fontSize: 14, lineHeight: 20, marginBottom: 14 },
  followBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 18,
    alignSelf: 'flex-start', marginBottom: 24,
  },
  followBtnPrimary: { backgroundColor: '#111', borderColor: '#111' },
  followBtnText: { fontSize: 14, fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
  emptyGrid: {
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14,
    padding: 32, alignItems: 'center', gap: 8,
  },
  emptyGridText: { fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridCell: {
    width: '31.5%', aspectRatio: 0.85, borderRadius: 12,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  gridImage: { width: '100%', height: '75%' },
  gridLabel: { fontSize: 10, fontWeight: '600', paddingHorizontal: 4, paddingBottom: 4, textAlign: 'center' },
  likeBadge: {
    position: 'absolute', top: 5, right: 5,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  likeBadgeCount: { color: '#fff', fontSize: 10, fontWeight: '700' },
  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 36, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  modalName: { fontSize: 18, fontWeight: '800', flex: 1, marginRight: 8 },
  modalDesc: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  modalItems: { maxHeight: 220, marginBottom: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, paddingVertical: 9 },
  itemThumbWrap: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  itemThumb: { width: '100%', height: '100%' },
  itemText: { flex: 1 },
  itemLabel: { fontSize: 11, fontWeight: '600' },
  itemName: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  likeCountLine: { fontSize: 13, fontWeight: '600', marginBottom: 14 },
  modalActions: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12,
  },
  actionBtnLiked: { backgroundColor: '#fff0f1' },
  actionBtnSave: { backgroundColor: '#111', borderColor: '#111' },
  actionBtnText: { fontSize: 14, fontWeight: '700' },
  hintRow: { marginTop: 12 },
  saveHint: { fontSize: 12, lineHeight: 20, textAlign: 'center' },
});
