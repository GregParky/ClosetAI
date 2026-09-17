import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Image,
  ActivityIndicator, Animated, Dimensions, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../context/ThemeContext';
import { getSavedOutfits, getOutfitRatings, saveOutfitRating, getBodyProfile } from '../firebase/firestoreService';
import BodyOutfitPreview from '../components/BodyOutfitPreview';
import { computeNewScores, selectPairs, scoreColor, scoreLabel, INITIAL_SCORE } from '../services/eloService';

const { width: SW } = Dimensions.get('window');
const CARD_WIDTH  = (SW - 56) / 2;  // two cards + gaps
const MAX_PAIRS   = 5;
const WIN_DELAY   = 650; // ms to show the winner before advancing

// ─── Helpers ──────────────────────────────────────────────────────────────────

function outfitThumb(outfit) {
  return [outfit?.top, outfit?.onePiece, outfit?.bottom, outfit?.layer, outfit?.shoes]
    .filter(Boolean).find((i) => i?.imageUrl)?.imageUrl ?? null;
}

function ScoreBadge({ score, size = 'sm' }) {
  const color = scoreColor(score);
  const label = scoreLabel(score);
  const isSmall = size === 'sm';
  return (
    <View style={[styles.scoreBadge, { backgroundColor: color + '22', borderColor: color }]}>
      <Ionicons name="star" size={isSmall ? 9 : 11} color={color} />
      <Text style={[styles.scoreBadgeText, { color, fontSize: isSmall ? 11 : 13 }]}>{label}</Text>
    </View>
  );
}

// ─── Outfit card (used during comparison) ─────────────────────────────────────

function ItemRow({ item, colors: c }) {
  if (!item) return null;
  const thumb = item.cutoutUrl || item.imageUrl || null;
  return (
    <View style={styles.itemRow}>
      <View style={[styles.itemThumb, { backgroundColor: c.surfaceAlt }]}>
        {thumb
          ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <Ionicons name="shirt-outline" size={16} color={c.textMuted} />}
      </View>
      <View style={styles.itemTextWrap}>
        <Text style={[styles.itemName, { color: c.text }]} numberOfLines={1}>{item.name || 'Unnamed item'}</Text>
        {!!item.category && (
          <Text style={[styles.itemCategory, { color: c.textMuted }]} numberOfLines={1}>{item.category}</Text>
        )}
      </View>
    </View>
  );
}

function CompareCard({ outfit, rating, chosen, rejected, tied, onPress, bodyProfile, tryonCache, colors: c }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacAnim  = useRef(new Animated.Value(1)).current;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (chosen) {
      Animated.spring(scaleAnim, { toValue: 1.04, useNativeDriver: true, speed: 20 }).start();
    } else if (rejected) {
      Animated.timing(opacAnim, { toValue: 0.3, duration: 250, useNativeDriver: true }).start();
    } else if (tied) {
      Animated.timing(opacAnim, { toValue: 0.85, duration: 250, useNativeDriver: true }).start();
    } else {
      scaleAnim.setValue(1);
      opacAnim.setValue(1);
    }
  }, [chosen, rejected, tied]);

  const thumb = outfitThumb(outfit);
  const items = [outfit.top, outfit.onePiece, outfit.bottom, outfit.layer, outfit.shoes].filter(Boolean);
  const itemCount = items.length;
  const score = rating?.score;

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }], opacity: opacAnim }]}>
      <Pressable
        style={[
          styles.card,
          { width: CARD_WIDTH, backgroundColor: c.surface, borderColor: chosen ? '#10b981' : tied ? '#3b82f6' : c.border },
          chosen && styles.cardChosen,
        ]}
        onPress={onPress}
        disabled={!!chosen || !!rejected || !!tied}
      >
        {/* Body + outfit preview */}
        <View style={[styles.cardImageWrap, { backgroundColor: c.surfaceAlt }]}>
          <BodyOutfitPreview
            outfit={outfit}
            bodyProfile={bodyProfile}
            width={CARD_WIDTH}
            cached={tryonCache?.current[outfit.id]}
            onTryonReady={(url, key) => { if (tryonCache) tryonCache.current[outfit.id] = { tryonUrl: url, outfitKey: key }; }}
          />
          {chosen && (
            <View style={styles.checkOverlay}>
              <Ionicons name="checkmark-circle" size={36} color="#10b981" />
            </View>
          )}
          {tied && (
            <View style={styles.tieOverlay}>
              <Ionicons name="git-compare-outline" size={32} color="#3b82f6" />
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.cardInfo}>
          <Text style={[styles.cardName, { color: c.text }]} numberOfLines={2}>{outfit.name}</Text>
          <View style={styles.cardMeta}>
            {score !== undefined
              ? <ScoreBadge score={score} />
              : <Text style={[styles.unrated, { color: c.textMuted }]}>Unrated</Text>}
            <Text style={[styles.itemCount, { color: c.textMuted }]}>{itemCount} items</Text>
          </View>

          {/* Details toggle */}
          <Pressable
            style={styles.detailsToggle}
            onPress={(e) => { e.stopPropagation?.(); setExpanded((v) => !v); }}
          >
            <Text style={[styles.detailsToggleText, { color: c.textMuted }]}>
              {expanded ? 'Hide details' : 'Show details'}
            </Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color={c.textMuted} />
          </Pressable>

          {expanded && (
            <View style={[styles.detailsList, { borderColor: c.border }]}>
              {items.map((item) => (
                <ItemRow key={item.id || item.name} item={item} colors={c} />
              ))}
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Results list ─────────────────────────────────────────────────────────────

function ResultsView({ outfits, ratingsMap, onDone, colors: c }) {
  const sorted = [...outfits]
    .filter((o) => ratingsMap[o.id])
    .sort((a, b) => (ratingsMap[b.id]?.score ?? 0) - (ratingsMap[a.id]?.score ?? 0));

  return (
    <View style={[styles.resultsContainer, { backgroundColor: c.background }]}>
      <Text style={[styles.resultsTitle, { color: c.text }]}>Your Outfit Rankings</Text>
      <Text style={[styles.resultsSubtitle, { color: c.textMuted }]}>
        Scores update with every comparison
      </Text>

      <ScrollView style={styles.resultsList} showsVerticalScrollIndicator={false}>
        {sorted.map((outfit, idx) => {
          const rating = ratingsMap[outfit.id];
          const thumb  = outfitThumb(outfit);
          const color  = scoreColor(rating?.score);
          return (
            <View key={outfit.id} style={[styles.resultRow, { borderColor: c.border, backgroundColor: c.surface }]}>
              {/* Rank */}
              <Text style={[styles.rankNum, { color: idx < 3 ? color : c.textMuted }]}>
                #{idx + 1}
              </Text>

              {/* Thumb */}
              <View style={[styles.resultThumb, { backgroundColor: c.surfaceAlt }]}>
                {thumb
                  ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} />
                  : <Ionicons name="shirt-outline" size={20} color={c.textMuted} />}
              </View>

              {/* Name + comparisons */}
              <View style={styles.resultInfo}>
                <Text style={[styles.resultName, { color: c.text }]} numberOfLines={1}>{outfit.name}</Text>
                <Text style={[styles.resultComps, { color: c.textMuted }]}>
                  {rating.comparisons} comparison{rating.comparisons !== 1 ? 's' : ''} · {rating.wins}W
                </Text>
              </View>

              {/* Score */}
              <View style={[styles.resultScore, { backgroundColor: color + '18' }]}>
                <Text style={[styles.resultScoreNum, { color }]}>{rating.score?.toFixed(1)}</Text>
              </View>
            </View>
          );
        })}

        {sorted.length === 0 && (
          <Text style={[styles.noResults, { color: c.textMuted }]}>No ratings yet — do a comparison first.</Text>
        )}
      </ScrollView>

      <Pressable style={styles.doneBtn} onPress={onDone}>
        <Text style={styles.doneBtnText}>Done</Text>
      </Pressable>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function OutfitCompareScreen({ navigation }) {
  const { user } = useAuth();
  const c = useColors();

  const [phase, setPhase] = useState('loading'); // loading | comparing | results
  const [bodyProfile, setBodyProfile] = useState(null);
  const [outfits, setOutfits]     = useState([]);
  const [ratingsMap, setRatingsMap] = useState({});
  const [pairs, setPairs]         = useState([]);
  const [pairIdx, setPairIdx]     = useState(0);
  const [chosen, setChosen]       = useState(null);  // 'a' | 'b' | null
  const timerRef = useRef(null);
  // Cache try-on URLs by outfitKey so they survive pair transitions
  const tryonCache = useRef({});

  const loadData = useCallback(async () => {
    if (!user?.uid) return;
    const [saved, ratings, profile] = await Promise.all([
      getSavedOutfits(user.uid),
      getOutfitRatings(user.uid),
      getBodyProfile(user.uid).catch(() => null),
    ]);
    setBodyProfile(profile);
    const validOutfits = (saved || []).filter((o) =>
      o.shoes && (o.onePiece || o.top || o.bottom)
    );
    setOutfits(validOutfits);
    setRatingsMap(ratings || {});

    if (validOutfits.length < 2) {
      setPhase('tooFew');
      return;
    }

    const count = Math.min(MAX_PAIRS, validOutfits.length - 1);
    const newPairs = selectPairs(validOutfits, ratings || {}, count);
    setPairs(newPairs);
    setPairIdx(0);
    setPhase('comparing');
  }, [user?.uid]);

  useEffect(() => {
    loadData();
    return () => clearTimeout(timerRef.current);
  }, [loadData]);

  const handleChoose = useCallback(async (winner, loser, side) => {
    if (chosen) return; // already chose
    setChosen(side);

    // Update ratings in memory immediately
    const ratingW = ratingsMap[winner.id];
    const ratingL = ratingsMap[loser.id];
    const { a: newW, b: newL } = computeNewScores(ratingW, ratingL, 1);

    const updatedMap = {
      ...ratingsMap,
      [winner.id]: { ...newW, outfitId: winner.id, outfitName: winner.name },
      [loser.id]:  { ...newL, outfitId: loser.id,  outfitName: loser.name },
    };
    setRatingsMap(updatedMap);

    // Persist both ratings
    await Promise.all([
      saveOutfitRating(user.uid, winner.id, winner.name, newW),
      saveOutfitRating(user.uid, loser.id,  loser.name,  newL),
    ]).catch(console.error);

    // Advance after delay
    timerRef.current = setTimeout(() => {
      setChosen(null);
      const nextIdx = pairIdx + 1;
      if (nextIdx >= pairs.length) {
        setPhase('results');
      } else {
        setPairIdx(nextIdx);
      }
    }, WIN_DELAY);
  }, [chosen, ratingsMap, pairIdx, pairs, user?.uid]);

  const handleTooClose = useCallback(async (a, b) => {
    if (chosen) return; // already chose
    setChosen('tie');

    // Tie outcome (0.5) nudges both scores toward each other
    const ratingA = ratingsMap[a.id];
    const ratingB = ratingsMap[b.id];
    const { a: newA, b: newB } = computeNewScores(ratingA, ratingB, 0.5);

    const updatedMap = {
      ...ratingsMap,
      [a.id]: { ...newA, outfitId: a.id, outfitName: a.name },
      [b.id]: { ...newB, outfitId: b.id, outfitName: b.name },
    };
    setRatingsMap(updatedMap);

    // Persist both ratings
    await Promise.all([
      saveOutfitRating(user.uid, a.id, a.name, newA),
      saveOutfitRating(user.uid, b.id, b.name, newB),
    ]).catch(console.error);

    // Advance after delay
    timerRef.current = setTimeout(() => {
      setChosen(null);
      const nextIdx = pairIdx + 1;
      if (nextIdx >= pairs.length) {
        setPhase('results');
      } else {
        setPairIdx(nextIdx);
      }
    }, WIN_DELAY);
  }, [chosen, ratingsMap, pairIdx, pairs, user?.uid]);

  const handleSkip = useCallback(() => {
    const nextIdx = pairIdx + 1;
    if (nextIdx >= pairs.length) {
      setPhase('results');
    } else {
      setPairIdx(nextIdx);
    }
  }, [pairIdx, pairs]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (phase === 'tooFew') {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Ionicons name="shirt-outline" size={48} color={c.border} />
        <Text style={[styles.tooFewTitle, { color: c.text }]}>Not enough outfits</Text>
        <Text style={[styles.tooFewBody, { color: c.textMuted }]}>
          Save at least 2 outfits on the Outfit tab to start comparing.
        </Text>
        <Pressable style={styles.doneBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.doneBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'results') {
    return (
      <ResultsView
        outfits={outfits}
        ratingsMap={ratingsMap}
        onDone={() => navigation.goBack()}
        colors={c}
      />
    );
  }

  // ── Comparing phase ─────────────────────────────────────────────────────────
  const [outfitA, outfitB] = pairs[pairIdx] || [];
  if (!outfitA || !outfitB) return null;

  const progress = pairIdx + 1;
  const total    = pairs.length;

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      {/* Progress */}
      <View style={styles.progressRow}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressDot,
              { backgroundColor: i < progress ? '#111' : c.border },
              i === pairIdx && { backgroundColor: '#111', width: 20 },
            ]}
          />
        ))}
      </View>

      <Text style={[styles.prompt, { color: c.text }]}>Which do you prefer?</Text>
      <Text style={[styles.sub, { color: c.textMuted }]}>{progress} of {total}</Text>

      {/* Cards */}
      <View style={styles.cardsRow}>
        <CompareCard
          outfit={outfitA}
          rating={ratingsMap[outfitA.id]}
          chosen={chosen === 'a'}
          rejected={chosen === 'b'}
          tied={chosen === 'tie'}
          onPress={() => handleChoose(outfitA, outfitB, 'a')}
          bodyProfile={bodyProfile}
          tryonCache={tryonCache}
          colors={c}
        />

        <View style={styles.vsWrap}>
          <Text style={[styles.vs, { color: c.textMuted }]}>VS</Text>
        </View>

        <CompareCard
          outfit={outfitB}
          rating={ratingsMap[outfitB.id]}
          chosen={chosen === 'b'}
          rejected={chosen === 'a'}
          tied={chosen === 'tie'}
          onPress={() => handleChoose(outfitB, outfitA, 'b')}
          bodyProfile={bodyProfile}
          tryonCache={tryonCache}
          colors={c}
        />
      </View>

      {/* Too close / Skip */}
      <Pressable
        style={styles.tooCloseBtn}
        onPress={() => handleTooClose(outfitA, outfitB)}
        disabled={!!chosen}
      >
        <Ionicons name="git-compare-outline" size={15} color="#3b82f6" />
        <Text style={styles.tooCloseText}>Too close to call</Text>
      </Pressable>

      <Pressable style={styles.skipBtn} onPress={handleSkip} disabled={!!chosen}>
        <Text style={[styles.skipText, { color: c.textMuted }]}>Skip this pair</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  progressDot: { width: 8, height: 8, borderRadius: 4 },

  prompt: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  sub: { fontSize: 14, marginBottom: 28 },

  cardsRow: { flexDirection: 'row', alignItems: 'center', gap: 0, width: '100%' },

  vsWrap: { width: 24, alignItems: 'center' },
  vs: { fontSize: 13, fontWeight: '800' },

  card: {
    borderWidth: 2, borderRadius: 18,
    overflow: 'hidden',
  },
  cardChosen: { borderColor: '#10b981', shadowColor: '#10b981', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  cardImageWrap: {
    width: '100%', aspectRatio: 0.4,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  cardImage: { width: '100%', height: '100%' },
  checkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16,185,129,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  tieOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(59,130,246,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardInfo: { padding: 10 },
  cardName: { fontSize: 13, fontWeight: '700', marginBottom: 6, lineHeight: 17 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  unrated: { fontSize: 11 },
  itemCount: { fontSize: 11 },

  detailsToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, marginTop: 8, paddingVertical: 4,
  },
  detailsToggleText: { fontSize: 11, fontWeight: '600' },
  detailsList: { marginTop: 6, borderTopWidth: 1, paddingTop: 6, gap: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemThumb: {
    width: 28, height: 28, borderRadius: 6, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  itemTextWrap: { flex: 1 },
  itemName: { fontSize: 11, fontWeight: '600' },
  itemCategory: { fontSize: 10, marginTop: 1, textTransform: 'capitalize' },

  scoreBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderWidth: 1, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2,
  },
  scoreBadgeText: { fontWeight: '800' },

  tooCloseBtn: {
    marginTop: 24, paddingVertical: 10, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#3b82f6', borderRadius: 20,
  },
  tooCloseText: { fontSize: 13, fontWeight: '700', color: '#3b82f6' },

  skipBtn: { marginTop: 12, paddingVertical: 10 },
  skipText: { fontSize: 14, fontWeight: '600' },

  // Results
  resultsContainer: { flex: 1, padding: 20, paddingBottom: 0 },
  resultsTitle: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
  resultsSubtitle: { fontSize: 13, marginBottom: 20 },
  resultsList: { flex: 1 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8,
  },
  rankNum: { fontSize: 16, fontWeight: '800', width: 28, textAlign: 'center' },
  resultThumb: { width: 48, height: 48, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  resultInfo: { flex: 1 },
  resultName: { fontSize: 14, fontWeight: '700' },
  resultComps: { fontSize: 11, marginTop: 2 },
  resultScore: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, minWidth: 48, alignItems: 'center' },
  resultScoreNum: { fontSize: 17, fontWeight: '800' },
  noResults: { textAlign: 'center', marginTop: 40, fontSize: 14 },

  doneBtn: {
    backgroundColor: '#111', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
    marginTop: 16, marginBottom: 16,
  },
  doneBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  tooFewTitle: { fontSize: 20, fontWeight: '800', marginTop: 16, marginBottom: 8, textAlign: 'center' },
  tooFewBody: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
});
