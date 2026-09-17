import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, FlatList,
  Pressable, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../context/ThemeContext';
import {
  searchUsers, getFollowStatus,
  sendFollowRequest, cancelFollowRequest, unfollowUser,
} from '../firebase/firestoreService';

const AVATAR_COLORS = ['#111', '#1a3a5c', '#c4714f', '#2d6a4f', '#6d3a8b'];
function avatarColor(uid = '') {
  let h = 0;
  for (const ch of uid) h = (h << 5) - h + ch.charCodeAt(0);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function MiniAvatar({ name, uid }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={[styles.avatar, { backgroundColor: avatarColor(uid) }]}>
      <Text style={styles.avatarText}>{initials}</Text>
    </View>
  );
}

function FollowChip({ status, onPress, colors: c }) {
  if (status === 'accepted') {
    return (
      <Pressable style={[styles.chip, { borderColor: c.borderStrong }]} onPress={onPress}>
        <Text style={[styles.chipText, { color: c.textSecondary }]}>Following</Text>
      </Pressable>
    );
  }
  if (status === 'pending') {
    return (
      <Pressable style={[styles.chip, { borderColor: c.borderStrong }]} onPress={onPress}>
        <Text style={[styles.chipText, { color: c.textMuted }]}>Requested</Text>
      </Pressable>
    );
  }
  return (
    <Pressable style={[styles.chip, styles.chipPrimary]} onPress={onPress}>
      <Text style={[styles.chipText, { color: '#fff' }]}>Follow</Text>
    </Pressable>
  );
}

export default function SearchUsersScreen({ navigation }) {
  const { user } = useAuth();
  const c = useColors();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim() || !user?.uid) return;
    setSearching(true);
    setSearched(true);
    try {
      const users = await searchUsers(query.trim(), user.uid);
      setResults(users);
      const statusEntries = await Promise.all(
        users.map((u) => getFollowStatus(user.uid, u.uid).then((s) => [u.uid, s]))
      );
      setStatuses(Object.fromEntries(statusEntries));
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  }, [query, user?.uid]);

  const handleFollowToggle = useCallback(async (targetUid, currentStatus) => {
    if (!user?.uid) return;
    const optimistic = currentStatus === null ? 'pending'
      : currentStatus === 'pending' ? null
      : null;
    setStatuses((prev) => ({ ...prev, [targetUid]: optimistic }));
    try {
      if (currentStatus === null) {
        await sendFollowRequest(user.uid, targetUid);
      } else if (currentStatus === 'pending') {
        await cancelFollowRequest(user.uid, targetUid);
      } else if (currentStatus === 'accepted') {
        await unfollowUser(user.uid, targetUid);
      }
    } catch (err) {
      setStatuses((prev) => ({ ...prev, [targetUid]: currentStatus }));
      console.error('Follow error:', err);
    }
  }, [user?.uid]);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Search bar */}
      <View style={[styles.searchBar, { backgroundColor: c.inputBg, borderColor: c.borderStrong }]}>
        <Ionicons name="search-outline" size={18} color={c.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="Search by name..."
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

      {searching && (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      )}

      {!searching && searched && results.length === 0 && (
        <View style={styles.center}>
          <Ionicons name="person-outline" size={40} color={c.border} />
          <Text style={[styles.emptyText, { color: c.textMuted }]}>No users found for "{query}"</Text>
          <Text style={[styles.emptyHint, { color: c.textMuted }]}>Try the full display name</Text>
        </View>
      )}

      {!searching && !searched && (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={44} color={c.border} />
          <Text style={[styles.emptyText, { color: c.textMuted }]}>Find friends on ClosetAI</Text>
          <Text style={[styles.emptyHint, { color: c.textMuted }]}>Search by their display name</Text>
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => item.uid}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const status = statuses[item.uid] ?? null;
          return (
            <Pressable
              style={[styles.userRow, { borderColor: c.border, backgroundColor: c.surface }]}
              onPress={() => navigation.navigate('OtherProfile', { userId: item.uid })}
            >
              <MiniAvatar name={item.displayName} uid={item.uid} />
              <View style={styles.userInfo}>
                <Text style={[styles.userName, { color: c.text }]}>{item.displayName}</Text>
                {item.bio ? (
                  <Text style={[styles.userBio, { color: c.textMuted }]} numberOfLines={1}>{item.bio}</Text>
                ) : null}
              </View>
              <FollowChip
                status={status}
                onPress={() => handleFollowToggle(item.uid, status)}
                colors={c}
              />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 16, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  emptyHint: { fontSize: 13, textAlign: 'center' },
  listContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 14, padding: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '700' },
  userBio: { fontSize: 12, marginTop: 2 },
  chip: {
    borderWidth: 1.5, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  chipPrimary: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { fontSize: 13, fontWeight: '700' },
});
