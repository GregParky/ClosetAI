import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, Image, Modal, TextInput, Alert,
  RefreshControl, ActionSheetIOS, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../context/ThemeContext';
import { storage } from '../firebase/firebaseConfig';
import {
  ensureUserProfile, updateUserProfile,
  getFollowerCount, getFollowingCount,
  getSavedOutfits, getUserCloset,
} from '../firebase/firestoreService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#1a1a2e', '#16213e', '#c4714f', '#2d6a4f', '#6d3a8b'];
function avatarColor(uid = '') {
  let h = 0;
  for (const ch of uid) h = (h << 5) - h + ch.charCodeAt(0);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function getInitials(name = '') {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

async function uploadProfilePhoto(uri, userId) {
  const response = await fetch(uri);
  const blob = await response.blob();
  // Store under the existing clothing/{userId} path so existing rules apply
  const storageRef = ref(storage, `clothing/${userId}/_profile.jpg`);
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
  return getDownloadURL(storageRef);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ name, uid, photoURL, size = 88, onPress, uploading }) {
  const initials = getInitials(name);
  const bgColor = avatarColor(uid);
  return (
    <Pressable onPress={onPress} style={[styles.avatarWrap, { width: size, height: size }]}>
      {photoURL ? (
        <Image
          source={{ uri: photoURL }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <View style={[styles.avatarCircle, { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor }]}>
          <Text style={[styles.avatarInitials, { fontSize: size * 0.35 }]}>{initials}</Text>
        </View>
      )}
      {/* Camera badge */}
      <View style={styles.cameraBadge}>
        {uploading
          ? <ActivityIndicator size="small" color="#fff" />
          : <Ionicons name="camera" size={13} color="#fff" />}
      </View>
    </Pressable>
  );
}

function StatItem({ value, label, onPress, colors: c }) {
  const inner = (
    <>
      <Text style={[styles.statNum, { color: c.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: c.textMuted }]}>{label}</Text>
    </>
  );
  if (onPress) {
    return (
      <Pressable style={styles.statItem} onPress={onPress} hitSlop={6}>
        {inner}
      </Pressable>
    );
  }
  return <View style={styles.statItem}>{inner}</View>;
}

function Divider({ colors: c }) {
  return <View style={[styles.statDivider, { backgroundColor: c.border }]} />;
}

// ─── Edit Profile Modal ───────────────────────────────────────────────────────

function EditModal({ visible, name, bio, onChangeName, onChangeBio, onSave, onClose, saving, colors: c }) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: c.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Edit Profile</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={c.textMuted} />
            </Pressable>
          </View>

          <Text style={[styles.inputLabel, { color: c.textMuted }]}>Display Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.borderStrong, color: c.text }]}
            value={name}
            onChangeText={onChangeName}
            placeholder="Your name"
            placeholderTextColor={c.placeholder}
            returnKeyType="next"
          />

          <Text style={[styles.inputLabel, { color: c.textMuted }]}>Bio</Text>
          <TextInput
            style={[styles.input, styles.inputMulti, { backgroundColor: c.inputBg, borderColor: c.borderStrong, color: c.text }]}
            value={bio}
            onChangeText={onChangeBio}
            placeholder="Tell people about your style..."
            placeholderTextColor={c.placeholder}
            multiline
            maxLength={150}
          />
          <Text style={[styles.charCount, { color: c.textMuted }]}>{bio.length}/150</Text>

          {saving ? (
            <ActivityIndicator style={{ marginTop: 20 }} />
          ) : (
            <Pressable style={styles.saveBtn} onPress={onSave}>
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Outfit grid ──────────────────────────────────────────────────────────────

function OutfitGrid({ outfits, colors: c }) {
  if (!outfits.length) {
    return (
      <View style={[styles.emptyGrid, { borderColor: c.borderStrong }]}>
        <Ionicons name="heart-outline" size={34} color={c.border} />
        <Text style={[styles.emptyGridText, { color: c.textMuted }]}>No saved outfits yet</Text>
        <Text style={[styles.emptyGridHint, { color: c.textMuted }]}>
          Generate and heart an outfit to save it here
        </Text>
      </View>
    );
  }
  const sorted = [...outfits].sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
  return (
    <View style={styles.grid}>
      {sorted.map((outfit) => {
        const thumb = [outfit.top, outfit.onePiece, outfit.bottom, outfit.shoes]
          .filter(Boolean).find((i) => i?.imageUrl);
        const count = outfit.likeCount || 0;
        return (
          <View key={outfit.id} style={[styles.gridCell, { backgroundColor: c.surfaceAlt }]}>
            {thumb?.imageUrl ? (
              <Image source={{ uri: thumb.imageUrl }} style={styles.gridImage} />
            ) : (
              <Ionicons name="shirt-outline" size={28} color={c.textMuted} />
            )}
            {count > 0 && (
              <View style={styles.likeBadge}>
                <Ionicons name="heart" size={10} color="#e0374a" />
                <Text style={styles.likeBadgeCount}>{count}</Text>
              </View>
            )}
            <Text style={[styles.gridLabel, { color: c.text }]} numberOfLines={1}>
              {outfit.name}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ProfileScreen({ navigation }) {
  const { user } = useAuth();
  const c = useColors();

  const [profile, setProfile] = useState(null);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [outfits, setOutfits] = useState([]);
  const [closetCount, setClosetCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);

  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.uid) return;
    const [prof, fc, fg, saved, closet] = await Promise.all([
      ensureUserProfile(user),
      getFollowerCount(user.uid),
      getFollowingCount(user.uid),
      getSavedOutfits(user.uid),
      getUserCloset(user.uid).catch(() => []),
    ]);
    setProfile(prof || {
      displayName: user.displayName || user.email?.split('@')[0] || 'User',
      bio: '',
      photoURL: user.photoURL || null,
    });
    setFollowers(fc);
    setFollowing(fg);
    // Only show outfits the user generated themselves, not ones saved from others
    setOutfits((Array.isArray(saved) ? saved : []).filter((o) => !o.savedFrom));
    setClosetCount(Array.isArray(closet) ? closet.length : 0);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // ── Photo upload ────────────────────────────────────────────────────────────

  const pickAndUpload = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo access to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    setPhotoUploading(true);
    try {
      const uri = result.assets[0].uri;
      const url = await uploadProfilePhoto(uri, user.uid);
      await updateUserProfile(user.uid, { photoURL: url });
      setProfile((p) => ({ ...p, photoURL: url }));
    } catch (err) {
      Alert.alert('Upload failed', err.message || 'Please try again.');
    } finally {
      setPhotoUploading(false);
    }
  }, [user?.uid]);

  const removePhoto = useCallback(async () => {
    try {
      await updateUserProfile(user.uid, { photoURL: null });
      setProfile((p) => ({ ...p, photoURL: null }));
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  }, [user?.uid]);

  const handleAvatarPress = useCallback(() => {
    if (photoUploading) return;
    if (Platform.OS === 'ios') {
      const options = profile?.photoURL
        ? ['Change Photo', 'Remove Photo', 'Cancel']
        : ['Choose Photo', 'Cancel'];
      const cancelIdx = options.length - 1;
      const destructiveIdx = profile?.photoURL ? 1 : undefined;
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIdx, destructiveButtonIndex: destructiveIdx },
        (idx) => {
          if (idx === 0) pickAndUpload();
          if (idx === 1 && profile?.photoURL) removePhoto();
        }
      );
    } else {
      pickAndUpload();
    }
  }, [photoUploading, profile?.photoURL, pickAndUpload, removePhoto]);

  // ── Edit profile ────────────────────────────────────────────────────────────

  const openEdit = () => {
    setEditName(profile?.displayName || '');
    setEditBio(profile?.bio || '');
    setEditVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    try {
      await updateUserProfile(user.uid, {
        displayName: editName.trim(),
        bio: editBio.trim(),
      });
      setProfile((p) => ({ ...p, displayName: editName.trim(), bio: editBio.trim() }));
      setEditVisible(false);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const displayName = profile?.displayName || 'User';

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Header */}
      <View style={[styles.screenHeader, { borderBottomColor: c.border }]}>
        <Text style={[styles.screenTitle, { color: c.text }]}>Profile</Text>
        <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={10}>
          <Ionicons name="settings-outline" size={21} color={c.textSecondary} />
        </Pressable>
      </View>

    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Avatar + stats row */}
      <View style={styles.topRow}>
        <Avatar
          name={displayName}
          uid={user.uid}
          photoURL={profile?.photoURL}
          onPress={handleAvatarPress}
          uploading={photoUploading}
        />
        <View style={styles.statsRow}>
          <StatItem value={closetCount} label="Items" colors={c} />
          <Divider colors={c} />
          <StatItem value={outfits.length} label="Outfits" colors={c} />
          <Divider colors={c} />
          <StatItem
            value={following}
            label="Following"
            colors={c}
            onPress={() => navigation.navigate('FollowList', { userId: user.uid, type: 'following' })}
          />
          <Divider colors={c} />
          <StatItem
            value={followers}
            label="Followers"
            colors={c}
            onPress={() => navigation.navigate('FollowList', { userId: user.uid, type: 'followers' })}
          />
        </View>
      </View>

      {/* Name & bio */}
      <Text style={[styles.displayName, { color: c.text }]}>{displayName}</Text>
      {profile?.bio ? (
        <Text style={[styles.bio, { color: c.textSecondary }]}>{profile.bio}</Text>
      ) : (
        <Pressable onPress={openEdit}>
          <Text style={[styles.bioEmpty, { color: c.textMuted }]}>Add a bio...</Text>
        </Pressable>
      )}

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <Pressable style={[styles.actionBtn, { borderColor: c.borderStrong }]} onPress={openEdit}>
          <Text style={[styles.actionBtnText, { color: c.text }]}>Edit Profile</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, { borderColor: c.borderStrong }]}
          onPress={() => navigation.navigate('SearchUsers')}
        >
          <Ionicons name="person-add-outline" size={16} color={c.text} />
          <Text style={[styles.actionBtnText, { color: c.text }]}>Find People</Text>
        </Pressable>
      </View>

      {/* Activity — full-width so it's easy to find */}
      <Pressable
        style={[styles.activityBtn, { backgroundColor: c.surface, borderColor: c.border }]}
        onPress={() => navigation.navigate('Activity')}
      >
        <Ionicons name="stats-chart-outline" size={18} color={c.text} />
        <Text style={[styles.activityBtnText, { color: c.text }]}>Activity & Stats</Text>
        <Ionicons name="chevron-forward" size={16} color={c.textMuted} style={{ marginLeft: 'auto' }} />
      </Pressable>

      {/* Saved outfits */}
      <Text style={[styles.sectionTitle, { color: c.text }]}>Saved Outfits</Text>
      <OutfitGrid outfits={outfits} colors={c} />

    </ScrollView>

      <EditModal
        visible={editVisible}
        name={editName}
        bio={editBio}
        onChangeName={setEditName}
        onChangeBio={setEditBio}
        onSave={handleSaveEdit}
        onClose={() => setEditVisible(false)}
        saving={saving}
        colors={c}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  screenHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 20,
  },
  screenTitle: { fontSize: 22, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 14 },

  avatarWrap: { position: 'relative' },
  avatarCircle: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: '#fff', fontWeight: '800' },
  cameraBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#111',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },

  statsRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statItem: { alignItems: 'center', flex: 1 },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: 26 },

  displayName: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  bio: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  bioEmpty: { fontSize: 14, marginBottom: 16 },

  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 28 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, borderWidth: 1.5, borderRadius: 10, paddingVertical: 8,
  },
  actionBtnText: { fontSize: 13, fontWeight: '700' },
  activityBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    marginBottom: 20,
  },
  activityBtnText: { fontSize: 14, fontWeight: '700' },

  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12 },

  emptyGrid: {
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14,
    padding: 36, alignItems: 'center', gap: 8,
  },
  emptyGridText: { fontSize: 14, fontWeight: '600' },
  emptyGridHint: { fontSize: 12, textAlign: 'center' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridCell: {
    width: '31.5%', aspectRatio: 0.85, borderRadius: 12,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  likeBadge: {
    position: 'absolute', top: 5, right: 5,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 10,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  likeBadgeCount: { color: '#fff', fontSize: 10, fontWeight: '700' },
  gridImage: { width: '100%', height: '75%' },
  gridLabel: {
    fontSize: 10, fontWeight: '600', paddingHorizontal: 4,
    paddingBottom: 4, textAlign: 'center',
  },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  inputLabel: {
    fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 6,
  },
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 15, marginBottom: 14,
  },
  inputMulti: { height: 90, textAlignVertical: 'top', marginBottom: 4 },
  charCount: { fontSize: 11, textAlign: 'right', marginBottom: 14 },
  saveBtn: {
    backgroundColor: '#111', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
