import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image,
  ActivityIndicator, RefreshControl, Pressable,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../context/ThemeContext';
import { getWearRatings } from '../firebase/firestoreService';
import { scoreColor, scoreLabel } from '../services/eloService';

function thumb(rating) {
  return [rating.top, rating.onePiece, rating.bottom, rating.shoes]
    .filter(Boolean).find((i) => i?.imageUrl)?.imageUrl ?? null;
}

export default function OutfitRatingsScreen() {
  const { user } = useAuth();
  const c = useColors();
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.uid) return;
    const data = await getWearRatings(user.uid);
    setRatings(data);
    setLoading(false);
  }, [user?.uid]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      style={[styles.container, { backgroundColor: c.background }]}
      contentContainerStyle={styles.content}
      data={ratings}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: c.text }]}>No ratings yet</Text>
          <Text style={[styles.emptySub, { color: c.textMuted }]}>
            Tap "Worn Today" on any saved outfit and rate it to build your personal rankings.
          </Text>
        </View>
      }
      renderItem={({ item, index }) => {
        const color  = scoreColor(item.score);
        const imgUri = thumb(item);
        return (
          <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.rank, { color: index < 3 ? color : c.textMuted }]}>
              #{index + 1}
            </Text>
            <View style={[styles.thumbWrap, { backgroundColor: c.surfaceAlt }]}>
              {imgUri
                ? <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                : null}
            </View>
            <View style={styles.info}>
              <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>{item.outfitName}</Text>
              <Text style={[styles.sub,  { color: c.textMuted }]}>Wear rating</Text>
            </View>
            <View style={[styles.scoreBadge, { backgroundColor: color + '18' }]}>
              <Text style={[styles.scoreNum, { color }]}>{scoreLabel(item.score)}</Text>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content:   { padding: 16, paddingBottom: 40 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle:{ fontSize: 18, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  emptySub:  { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8,
  },
  rank:      { fontSize: 16, fontWeight: '800', width: 32, textAlign: 'center' },
  thumbWrap: { width: 52, height: 52, borderRadius: 10, overflow: 'hidden' },
  info:      { flex: 1 },
  name:      { fontSize: 14, fontWeight: '700' },
  sub:       { fontSize: 11, marginTop: 2 },
  scoreBadge:{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, minWidth: 52, alignItems: 'center' },
  scoreNum:  { fontSize: 17, fontWeight: '800' },
});
