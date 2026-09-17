import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  Pressable, Image, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../context/ThemeContext';
import { getFollowerList, getFollowingList, getUserProfile } from '../firebase/firestoreService';

const AVATAR_COLORS = ['#1a1a2e', '#16213e', '#c4714f', '#2d6a4f', '#6d3a8b'];
function avatarColor(uid = '') {
  let h = 0;
  for (const ch of uid) h = (h << 5) - h + ch.charCodeAt(0);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function UserRow({ profile, onPress, colors: c }) {
  const initials = (profile.displayName || '?')
    .split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <Pressable
      style={[styles.row, { borderColor: c.border, backgroundColor: c.surface }]}
      onPress={onPress}
    >
      {profile.photoURL ? (
        <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: avatarColor(profile.uid) }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={[styles.name, { color: c.text }]}>{profile.displayName}</Text>
        {profile.bio ? (
          <Text style={[styles.bio, { color: c.textMuted }]} numberOfLines={1}>
            {profile.bio}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function FollowListScreen({ route, navigation }) {
  const { userId, type } = route.params; // type: 'followers' | 'following'
  const { user } = useAuth();
  const c = useColors();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const uids = type === 'followers'
        ? await getFollowerList(userId)
        : await getFollowingList(userId);

      const profileResults = await Promise.all(
        uids.map((uid) => getUserProfile(uid).catch(() => null))
      );
      setProfiles(profileResults.filter(Boolean));
    } catch (err) {
      console.error('FollowListScreen load error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, type]);

  useEffect(() => { loadList(); }, [loadList]);

  const handlePress = useCallback((profile) => {
    if (profile.uid === user?.uid) {
      // Tapping own entry — just pop back
      navigation.goBack();
    } else {
      navigation.push('OtherProfile', { userId: profile.uid });
    }
  }, [user?.uid, navigation]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <FlatList
        data={profiles}
        keyExtractor={(item) => item.uid}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <UserRow
            profile={item}
            onPress={() => handlePress(item)}
            colors={c}
          />
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={[styles.empty, { color: c.textMuted }]}>
              {type === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  list: { padding: 16, gap: 10, paddingBottom: 32 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 14, padding: 12,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700' },
  bio: { fontSize: 12, marginTop: 2 },
  empty: { fontSize: 14, textAlign: 'center' },
});
