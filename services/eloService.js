// ELO-based rating system scaled to 0.0–10.0

const INITIAL_SCORE = 5.0;
const K_BASE        = 0.8;   // max score shift per comparison
const K_MIN         = 0.25;  // floor once an outfit is well-established
const SCALE         = 4;     // spread factor (higher = slower convergence)
const COMPARISONS_STABLE = 20; // after this many comps, K approaches K_MIN

export function expectedScore(rA, rB) {
  return 1 / (1 + Math.pow(10, (rB - rA) / SCALE));
}

// Decay K so well-rated outfits move slower — mirrors how Beli works
function effectiveK(comparisons) {
  return Math.max(K_MIN, K_BASE * (1 - comparisons / (COMPARISONS_STABLE + comparisons)));
}

/**
 * Compute new scores after a comparison.
 * @param {object} ratingA - { score, comparisons, wins } — defaults applied if missing
 * @param {object} ratingB
 * @param {number} outcome - 1 = A wins, 0 = B wins (no ties)
 * @returns {{ a: object, b: object }}
 */
export function computeNewScores(ratingA, ratingB, outcome) {
  const sA = ratingA?.score       ?? INITIAL_SCORE;
  const sB = ratingB?.score       ?? INITIAL_SCORE;
  const cA = ratingA?.comparisons ?? 0;
  const cB = ratingB?.comparisons ?? 0;

  const eA = expectedScore(sA, sB);
  const eB = 1 - eA;

  const newA = Math.max(0, Math.min(10, sA + effectiveK(cA) * (outcome       - eA)));
  const newB = Math.max(0, Math.min(10, sB + effectiveK(cB) * ((1 - outcome) - eB)));

  return {
    a: {
      score:       parseFloat(newA.toFixed(1)),
      comparisons: cA + 1,
      wins:        (ratingA?.wins ?? 0) + (outcome === 1 ? 1 : 0),
    },
    b: {
      score:       parseFloat(newB.toFixed(1)),
      comparisons: cB + 1,
      wins:        (ratingB?.wins ?? 0) + (outcome === 0 ? 1 : 0),
    },
  };
}

/**
 * Pick pairs for a comparison session.
 * Prioritises outfits with the fewest comparisons (establish ratings faster).
 * Each outfit appears at most once per session.
 */
export function selectPairs(outfits, ratingsMap, maxPairs = 5) {
  const sorted = [...outfits].sort((a, b) => {
    const ca = ratingsMap[a.id]?.comparisons ?? 0;
    const cb = ratingsMap[b.id]?.comparisons ?? 0;
    if (ca !== cb) return ca - cb;
    return Math.random() - 0.5; // break ties randomly
  });

  const pairs = [];
  const used  = new Set();

  for (let i = 0; i < sorted.length && pairs.length < maxPairs; i++) {
    if (used.has(i)) continue;
    for (let j = i + 1; j < sorted.length && pairs.length < maxPairs; j++) {
      if (used.has(j)) continue;
      pairs.push([sorted[i], sorted[j]]);
      used.add(i);
      used.add(j);
      break;
    }
  }

  return pairs;
}

export function scoreColor(score) {
  if (score === undefined || score === null) return '#8a8a8a';
  if (score >= 8.5) return '#f59e0b'; // gold
  if (score >= 7.0) return '#10b981'; // green
  if (score >= 5.0) return '#3b82f6'; // blue
  return '#ef4444';                    // red
}

export function scoreLabel(score) {
  if (score === undefined || score === null) return 'Unrated';
  return score.toFixed(1);
}

export { INITIAL_SCORE };
