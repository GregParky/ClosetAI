// firebase/firestoreService.js
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  setDoc,
  serverTimestamp,
  updateDoc,
  increment,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from './firebaseConfig';

/**
 * Top-level collection for all clothing items.
 * Each doc MUST include: userId (owner uid)
 * Optional fields: category, type, color, imageUrl, createdAt
 */
const closetsRef = collection(db, 'closets');

/**
 * Add a clothing item to the user's closet
 * @param {string} userId
 * @param {Object} item { imageUrl, category?, type?, color?, ... }
 * @returns {Promise<string>} new document id
 */
export async function addClothingItem(userId, item) {
  try {
    if (!userId) throw new Error('addClothingItem: missing userId');
    if (!item) throw new Error('addClothingItem: missing item');

    const payload = {
      userId, // ✅ required for rules
      imageUrl: item.imageUrl,
      category: item.category ?? 'unassigned',
      type: item.type ?? 'unknown',
      color: item.color ?? 'unknown',
      createdAt: serverTimestamp(), // ✅ consistent ordering + avoids client clock issues
      ...item, // allow extra metadata later (brand, season, tags, etc.)
    };

    // Ensure userId can't be overridden by item
    payload.userId = userId;

    const docRef = await addDoc(closetsRef, payload);
    return docRef.id;
  } catch (err) {
    console.error('addClothingItem error:', err);
    throw err;
  }
}

/**
 * Get all clothing items for a specific user (newest first)
 * Composite index (userId + createdAt) is defined in firestore.indexes.json.
 * The orderBy is applied client-side so the query works even before the index
 * is deployed, avoiding a FAILED_PRECONDITION error on first run.
 * @param {string} userId
 * @returns {Promise<Array>} Array of clothing items, newest first
 */
export async function getUserCloset(userId) {
  try {
    if (!userId) throw new Error('getUserCloset: missing userId');

    const q = query(
      closetsRef,
      where('userId', '==', userId)
    );

    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Sort newest-first client-side (Firestore Timestamp or millis both compare fine)
    items.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? a.createdAt ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? b.createdAt ?? 0;
      return tb - ta;
    });
    return items;
  } catch (err) {
    console.error('getUserCloset error:', err);
    throw err;
  }
}

/**
 * Update a clothing item category (used for drag/drop)
 * @param {string} itemId
 * @param {string} category
 */
export async function updateClothingItemCategory(itemId, category) {
  try {
    if (!itemId) throw new Error('updateClothingItemCategory: missing itemId');
    if (!category) throw new Error('updateClothingItemCategory: missing category');

    await updateDoc(doc(db, 'closets', itemId), { category });
  } catch (err) {
    console.error('updateClothingItemCategory error:', err);
    throw err;
  }
}

/**
 * Update arbitrary fields on a clothing item (future-proof helper)
 * @param {string} itemId
 * @param {Object} patch
 */
export async function updateClothingItem(itemId, patch) {
  try {
    if (!itemId) throw new Error('updateClothingItem: missing itemId');
    if (!patch || typeof patch !== 'object') throw new Error('updateClothingItem: invalid patch');

    await updateDoc(doc(db, 'closets', itemId), patch);
  } catch (err) {
    console.error('updateClothingItem error:', err);
    throw err;
  }
}

/**
 * Delete a clothing item from the closet
 * @param {string} itemId - Firestore document ID
 */
export async function deleteClothingItem(itemId) {
  try {
    if (!itemId) throw new Error('deleteClothingItem: missing itemId');
    await deleteDoc(doc(db, 'closets', itemId));
  } catch (err) {
    console.error('deleteClothingItem error:', err);
    throw err;
  }
}

/**
 * Save user preferences (e.g., style, temperature comfort, etc.)
 * Stored at: preferences/{userId}
 * @param {string} userId
 * @param {Object} preferences
 */
export async function saveUserPreferences(userId, preferences) {
  try {
    if (!userId) throw new Error('saveUserPreferences: missing userId');
    if (!preferences || typeof preferences !== 'object') {
      throw new Error('saveUserPreferences: invalid preferences');
    }

    await setDoc(doc(db, 'preferences', userId), preferences, { merge: true });
  } catch (err) {
    console.error('saveUserPreferences error:', err);
    throw err;
  }
}

/**
 * Get user preferences
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
export async function getUserPreferences(userId) {
  try {
    if (!userId) throw new Error('getUserPreferences: missing userId');

    const docRef = doc(db, 'preferences', userId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
  } catch (err) {
    console.error('getUserPreferences error:', err);
    throw err;
  }
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return 0;
}

async function fetchRecentCollectionDocs(collectionName, maxItems = 24) {
  const ref = collection(db, collectionName);
  try {
    const snap = await getDocs(query(ref, orderBy('createdAt', 'desc'), limit(maxItems)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    // If createdAt is missing or index is unavailable, still return some docs.
    try {
      const snap = await getDocs(query(ref, limit(maxItems)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {
      // Missing permissions/collection should not break the whole discover feed.
      return [];
    }
  }
}

async function fetchPublicClosetDocs(maxItems = 24) {
  try {
    const snap = await getDocs(
      query(closetsRef, where('isPublic', '==', true), orderBy('createdAt', 'desc'), limit(maxItems))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    try {
      const snap = await getDocs(query(closetsRef, where('isPublic', '==', true), limit(maxItems)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {
      return [];
    }
  }
}

/**
 * Explore feed for Discover screen.
 * Pulls from existing user outfits (closets) and optional partner/trending collections.
 *
 * Optional collections read (if present):
 * - partnerRecommendations / partner_products / partnerProducts
 * - trendingOutfits / trending_outfits
 */
export async function getDiscoverFeed(viewerUserId, maxItems = 60) {
  const [closetDocs, partnerA, partnerB, partnerC, trendingA, trendingB] = await Promise.all([
    fetchPublicClosetDocs(maxItems),
    fetchRecentCollectionDocs('partnerRecommendations', 18),
    fetchRecentCollectionDocs('partner_products', 18),
    fetchRecentCollectionDocs('partnerProducts', 18),
    fetchRecentCollectionDocs('trendingOutfits', 18),
    fetchRecentCollectionDocs('trending_outfits', 18),
  ]);

  const outfits = closetDocs
    .filter((it) => !!it.imageUrl)
    .filter((it) => (viewerUserId ? it.userId !== viewerUserId : true))
    .map((it) => ({
      id: `closet-${it.id}`,
      kind: 'outfit',
      imageUrl: it.imageUrl,
      title: it.type && it.type !== 'unknown' ? it.type : 'Outfit post',
      subtitle: it.userId ? `@${String(it.userId).slice(0, 8)}` : '@closet-user',
      createdAtMs: toMillis(it.createdAt),
    }));

  const partnerDocs = [...partnerA, ...partnerB, ...partnerC];
  const partners = partnerDocs
    .filter((it) => !!it.imageUrl)
    .map((it, idx) => ({
      id: `partner-${it.id || idx}`,
      kind: 'partner',
      imageUrl: it.imageUrl,
      title: it.title || it.productName || 'Partner pick',
      subtitle: it.partnerName || it.brand || 'Sponsored',
      createdAtMs: toMillis(it.createdAt),
    }));

  const trendingDocs = [...trendingA, ...trendingB];
  const trending = trendingDocs
    .filter((it) => !!it.imageUrl)
    .map((it, idx) => ({
      id: `trend-${it.id || idx}`,
      kind: 'trend',
      imageUrl: it.imageUrl,
      title: it.title || it.caption || 'Trending outfit',
      subtitle: 'Trending',
      createdAtMs: toMillis(it.createdAt),
    }));

  return [...outfits, ...partners, ...trending]
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, maxItems);
}

async function safeQueryDocs(buildQuery, fallbackBuildQuery) {
  try {
    const snap = await getDocs(buildQuery());
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    if (!fallbackBuildQuery) return [];
    try {
      const snap = await getDocs(fallbackBuildQuery());
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {
      return [];
    }
  }
}

function normalizeNotification(docData) {
  const title = docData.title || docData.subject || docData.type || 'ClosetAI';
  const preview = docData.preview || docData.body || docData.message || 'New update from ClosetAI';
  return {
    id: `notification-${docData.id}`,
    title,
    preview,
    timeLabel: docData.createdAtMs ? new Date(docData.createdAtMs).toLocaleDateString() : '',
    createdAtMs: docData.createdAtMs || toMillis(docData.createdAt),
  };
}

function normalizeThread(docData, viewerUserId) {
  const participantNames = Array.isArray(docData.participantNames) ? docData.participantNames : [];
  const participantIds = Array.isArray(docData.participantIds) ? docData.participantIds : [];

  let title =
    docData.otherUserName ||
    docData.otherParticipantName ||
    docData.title ||
    docData.name ||
    null;

  if (!title && participantNames.length > 0) {
    title = participantNames[0];
  }

  if (!title && participantIds.length > 0) {
    const someoneElse = participantIds.find((id) => id && id !== viewerUserId);
    title = someoneElse ? `@${String(someoneElse).slice(0, 8)}` : 'Direct message';
  }

  return {
    id: `thread-${docData.id}`,
    title: title || 'Direct message',
    preview:
      docData.lastMessageText ||
      docData.lastMessage ||
      docData.preview ||
      'Tap to open conversation',
    timeLabel: docData.updatedAtMs ? new Date(docData.updatedAtMs).toLocaleDateString() : '',
    createdAtMs: docData.updatedAtMs || toMillis(docData.updatedAt || docData.createdAt),
  };
}

function itemSnapshot(item) {
  if (!item) return null;
  return {
    id: item.id || '',
    name: item.name || '',
    color: item.color || '',
    imageUrl: item.imageUrl || '',
    cutoutUrl: item.cutoutUrl || null,
    category: item.category || '',
  };
}

export async function saveOutfit(userId, outfit) {
  try {
    if (!userId) throw new Error('saveOutfit: missing userId');
    const payload = {
      userId,
      name: outfit.name || 'Saved Outfit',
      description: outfit.description || '',
      top: itemSnapshot(outfit.top),
      bottom: itemSnapshot(outfit.bottom),
      onePiece: itemSnapshot(outfit.onePiece),
      layer: itemSnapshot(outfit.layer),
      shoes: itemSnapshot(outfit.shoes),
      savedAt: serverTimestamp(),
      likeCount: 0,
      savedFrom: null,
    };
    const docRef = await addDoc(collection(db, 'savedOutfits'), payload);
    return docRef.id;
  } catch (err) {
    console.error('saveOutfit error:', err);
    throw err;
  }
}

export async function saveOutfitFromProfile(userId, outfit, fromUserId, fromDisplayName) {
  try {
    if (!userId) throw new Error('saveOutfitFromProfile: missing userId');
    const payload = {
      userId,
      name: outfit.name || 'Saved Outfit',
      description: outfit.description || '',
      top: outfit.top || null,
      bottom: outfit.bottom || null,
      onePiece: outfit.onePiece || null,
      layer: outfit.layer || null,
      shoes: outfit.shoes || null,
      savedAt: serverTimestamp(),
      likeCount: 0,
      savedFrom: { userId: fromUserId, displayName: fromDisplayName },
    };
    const docRef = await addDoc(collection(db, 'savedOutfits'), payload);
    return docRef.id;
  } catch (err) {
    console.error('saveOutfitFromProfile error:', err);
    throw err;
  }
}

// ─── Outfit likes ─────────────────────────────────────────────────────────────

export async function likeOutfit(userId, outfitId, outfitOwnerId, outfitName, outfitDescription) {
  try {
    await setDoc(doc(db, 'outfitLikes', `${userId}_${outfitId}`), {
      userId,
      outfitId,
      outfitOwnerId,
      outfitName: outfitName || '',
      outfitDescription: outfitDescription || '',
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'savedOutfits', outfitId), { likeCount: increment(1) });
  } catch (err) {
    console.error('likeOutfit error:', err);
    throw err;
  }
}

export async function unlikeOutfit(userId, outfitId) {
  try {
    await deleteDoc(doc(db, 'outfitLikes', `${userId}_${outfitId}`));
    await updateDoc(doc(db, 'savedOutfits', outfitId), { likeCount: increment(-1) });
  } catch (err) {
    console.error('unlikeOutfit error:', err);
    throw err;
  }
}

export async function getLikeStatus(userId, outfitId) {
  const snap = await getDoc(doc(db, 'outfitLikes', `${userId}_${outfitId}`));
  return snap.exists();
}

export async function getLikeStatuses(userId, outfitIds) {
  const results = await Promise.all(
    outfitIds.map((id) =>
      getDoc(doc(db, 'outfitLikes', `${userId}_${id}`)).then((s) => [id, s.exists()])
    )
  );
  return Object.fromEntries(results);
}

export async function getUserLikedOutfits(userId, limitCount = 12) {
  try {
    const q = query(
      collection(db, 'outfitLikes'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data());
  } catch {
    return [];
  }
}

// ─── Wear ratings (direct score after wearing) ───────────────────────────────

export async function saveWearRating(userId, outfitId, outfitData, score) {
  await setDoc(doc(db, 'outfitWearRatings', `${userId}_${outfitId}`), {
    userId,
    outfitId,
    outfitName: outfitData.name || '',
    score,
    top:      outfitData.top      || null,
    bottom:   outfitData.bottom   || null,
    onePiece: outfitData.onePiece || null,
    layer:    outfitData.layer    || null,
    shoes:    outfitData.shoes    || null,
    ratedAt:  serverTimestamp(),
  });
}

export async function getWearRatings(userId) {
  try {
    const q = query(
      collection(db, 'outfitWearRatings'),
      where('userId', '==', userId),
      orderBy('score', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

export async function getTopRatedOutfits(userId, minScore = 7.0, limitCount = 10) {
  const all = await getWearRatings(userId);
  return all.filter((r) => r.score >= minScore).slice(0, limitCount);
}

// ─── Outfit ratings (ELO) ────────────────────────────────────────────────────

export async function getOutfitRatings(userId) {
  try {
    const q = query(collection(db, 'outfitRatings'), where('userId', '==', userId));
    const snap = await getDocs(q);
    const map = {};
    snap.docs.forEach((d) => { map[d.data().outfitId] = d.data(); });
    return map;
  } catch {
    return {};
  }
}

export async function saveOutfitRating(userId, outfitId, outfitName, ratingData) {
  await setDoc(doc(db, 'outfitRatings', `${userId}_${outfitId}`), {
    userId,
    outfitId,
    outfitName: outfitName || '',
    score:       ratingData.score,
    comparisons: ratingData.comparisons,
    wins:        ratingData.wins,
    updatedAt:   serverTimestamp(),
  });
}

export async function unsaveOutfit(savedOutfitId) {
  try {
    if (!savedOutfitId) throw new Error('unsaveOutfit: missing id');
    await deleteDoc(doc(db, 'savedOutfits', savedOutfitId));
  } catch (err) {
    console.error('unsaveOutfit error:', err);
    throw err;
  }
}

export async function getSavedOutfits(userId) {
  try {
    if (!userId) throw new Error('getSavedOutfits: missing userId');
    const q = query(
      collection(db, 'savedOutfits'),
      where('userId', '==', userId),
      orderBy('savedAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('getSavedOutfits error:', err);
    throw err;
  }
}

/**
 * Re-sync each saved outfit's item snapshots (imageUrl/cutoutUrl/name/color)
 * with the current state of the user's closet items. Saved outfits store a
 * point-in-time copy of each item, so edits to closet items (e.g. re-cropped
 * photos) don't automatically propagate without this.
 * @param {string} userId
 * @returns {Promise<{ total: number, updated: number }>}
 */
export async function refreshSavedOutfitSnapshots(userId) {
  try {
    if (!userId) throw new Error('refreshSavedOutfitSnapshots: missing userId');

    const [closetItems, savedOutfits] = await Promise.all([
      getUserCloset(userId),
      getSavedOutfits(userId),
    ]);

    const closetMap = {};
    closetItems.forEach((item) => { closetMap[item.id] = item; });

    let updated = 0;
    for (const outfit of savedOutfits) {
      const patch = {};
      let changed = false;

      for (const slot of ['top', 'bottom', 'onePiece', 'layer', 'shoes']) {
        const snap = outfit[slot];
        const live = snap?.id ? closetMap[snap.id] : null;
        if (!snap || !live) continue;

        const refreshed = itemSnapshot(live);
        if (refreshed.imageUrl !== snap.imageUrl || refreshed.cutoutUrl !== snap.cutoutUrl) {
          patch[slot] = refreshed;
          changed = true;
        }
      }

      if (changed) {
        await updateDoc(doc(db, 'savedOutfits', outfit.id), patch);
        updated++;
      }
    }

    return { total: savedOutfits.length, updated };
  } catch (err) {
    console.error('refreshSavedOutfitSnapshots error:', err);
    throw err;
  }
}

// ─── Wear logging ────────────────────────────────────────────────────────────

export async function logWear(userId, outfit) {
  try {
    if (!userId) throw new Error('logWear: missing userId');
    const docRef = await addDoc(collection(db, 'wearLogs'), {
      userId,
      outfitId: outfit.id || '',
      outfitName: outfit.name || 'Outfit',
      wornAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (err) {
    console.error('logWear error:', err);
    throw err;
  }
}

export async function getWearLogs(userId, limitCount = 60) {
  try {
    if (!userId) throw new Error('getWearLogs: missing userId');
    const q = query(
      collection(db, 'wearLogs'),
      where('userId', '==', userId),
      orderBy('wornAt', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('getWearLogs error:', err);
    return [];
  }
}

// ─── Outfit calendar ─────────────────────────────────────────────────────────

export async function setOutfitPlan(userId, date, outfit) {
  try {
    if (!userId || !date) throw new Error('setOutfitPlan: missing params');
    const docId = `${userId}_${date}`;
    await setDoc(doc(db, 'outfitPlans', docId), {
      userId,
      date,
      outfitId: outfit.id || '',
      name: outfit.name || 'Outfit',
      description: outfit.description || '',
      top: itemSnapshot(outfit.top),
      bottom: itemSnapshot(outfit.bottom),
      onePiece: itemSnapshot(outfit.onePiece),
      layer: itemSnapshot(outfit.layer),
      shoes: itemSnapshot(outfit.shoes),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('setOutfitPlan error:', err);
    throw err;
  }
}

export async function getOutfitPlans(userId, startDate, endDate) {
  try {
    if (!userId) throw new Error('getOutfitPlans: missing userId');
    const q = query(
      collection(db, 'outfitPlans'),
      where('userId', '==', userId),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('getOutfitPlans error:', err);
    return [];
  }
}

export async function removeOutfitPlan(userId, date) {
  try {
    if (!userId || !date) throw new Error('removeOutfitPlan: missing params');
    await deleteDoc(doc(db, 'outfitPlans', `${userId}_${date}`));
  } catch (err) {
    console.error('removeOutfitPlan error:', err);
    throw err;
  }
}

// ─── Inbox ───────────────────────────────────────────────────────────────────

// ─── User profiles ────────────────────────────────────────────────────────────

// ─── Body profile ─────────────────────────────────────────────────────────────

export async function saveBodyProfile(userId, profile) {
  await updateDoc(doc(db, 'users', userId), { bodyProfile: profile });
}

export async function getBodyProfile(userId) {
  const snap = await getDoc(doc(db, 'users', userId));
  return snap.exists() ? (snap.data().bodyProfile ?? null) : null;
}

// ─── User profiles ────────────────────────────────────────────────────────────

export async function ensureUserProfile(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const name = user.displayName || user.email?.split('@')[0] || 'User';
    await setDoc(ref, {
      uid: user.uid,
      displayName: name,
      displayNameLower: name.toLowerCase(),
      email: user.email || '',
      photoURL: user.photoURL || null,
      bio: '',
      createdAt: serverTimestamp(),
    });
    return null;
  }
  return { uid: user.uid, ...snap.data() };
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

export async function updateUserProfile(uid, patch) {
  const data = { ...patch };
  if (patch.displayName) data.displayNameLower = patch.displayName.toLowerCase();
  await updateDoc(doc(db, 'users', uid), data);
}

export async function searchUsers(searchText, currentUid) {
  const lower = (searchText || '').toLowerCase().trim();
  if (!lower) return [];
  const q = query(
    collection(db, 'users'),
    where('displayNameLower', '>=', lower),
    where('displayNameLower', '<=', lower + ''),
    limit(25)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter((u) => u.uid !== currentUid);
}

// ─── Follows ─────────────────────────────────────────────────────────────────

function followDocId(followerId, followeeId) {
  return `${followerId}_${followeeId}`;
}

export async function getFollowStatus(followerId, followeeId) {
  const snap = await getDoc(doc(db, 'follows', followDocId(followerId, followeeId)));
  return snap.exists() ? snap.data().status : null; // null | 'pending' | 'accepted'
}

export async function sendFollowRequest(followerId, followeeId) {
  await setDoc(doc(db, 'follows', followDocId(followerId, followeeId)), {
    followerId,
    followeeId,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

export async function cancelFollowRequest(followerId, followeeId) {
  await deleteDoc(doc(db, 'follows', followDocId(followerId, followeeId)));
}

export async function acceptFollowRequest(followerId, followeeId) {
  await updateDoc(doc(db, 'follows', followDocId(followerId, followeeId)), { status: 'accepted' });
}

export async function declineFollowRequest(followerId, followeeId) {
  await deleteDoc(doc(db, 'follows', followDocId(followerId, followeeId)));
}

export async function unfollowUser(followerId, followeeId) {
  await deleteDoc(doc(db, 'follows', followDocId(followerId, followeeId)));
}

export async function getFollowerCount(userId) {
  const q = query(
    collection(db, 'follows'),
    where('followeeId', '==', userId),
    where('status', '==', 'accepted')
  );
  const snap = await getDocs(q);
  return snap.size;
}

export async function getFollowingCount(userId) {
  const q = query(
    collection(db, 'follows'),
    where('followerId', '==', userId),
    where('status', '==', 'accepted')
  );
  const snap = await getDocs(q);
  return snap.size;
}

export async function getFollowerList(userId) {
  try {
    const q = query(
      collection(db, 'follows'),
      where('followeeId', '==', userId),
      where('status', '==', 'accepted')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data().followerId);
  } catch {
    return [];
  }
}

export async function getFollowingList(userId) {
  try {
    const q = query(
      collection(db, 'follows'),
      where('followerId', '==', userId),
      where('status', '==', 'accepted')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data().followeeId);
  } catch {
    return [];
  }
}

export async function getPendingFollowRequests(userId) {
  try {
    const q = query(
      collection(db, 'follows'),
      where('followeeId', '==', userId),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    // Index may still be building — fall back to unordered query
    console.warn('getPendingFollowRequests ordered query failed, trying fallback:', err?.message);
    try {
      const q2 = query(
        collection(db, 'follows'),
        where('followeeId', '==', userId),
        where('status', '==', 'pending')
      );
      const snap2 = await getDocs(q2);
      return snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err2) {
      console.error('getPendingFollowRequests fallback failed:', err2?.message);
      return [];
    }
  }
}

// ─── Inbox ───────────────────────────────────────────────────────────────────

export async function getInboxData(userId, maxItemsPerSection = 30) {
  if (!userId) return { notifications: [], directMessages: [] };

  const notificationsRef = collection(db, 'notifications');
  const threadsRef = collection(db, 'threads');

  const [notificationDocs, threadDocs] = await Promise.all([
    safeQueryDocs(
      () =>
        query(
          notificationsRef,
          where('userId', '==', userId),
          orderBy('createdAt', 'desc'),
          limit(maxItemsPerSection)
        ),
      () => query(notificationsRef, where('userId', '==', userId), limit(maxItemsPerSection))
    ),
    safeQueryDocs(
      () =>
        query(
          threadsRef,
          where('participantIds', 'array-contains', userId),
          orderBy('updatedAt', 'desc'),
          limit(maxItemsPerSection)
        ),
      () =>
        query(
          threadsRef,
          where('participantIds', 'array-contains', userId),
          limit(maxItemsPerSection)
        )
    ),
  ]);

  const notifications = notificationDocs
    .map((d) => ({
      ...d,
      createdAtMs: toMillis(d.createdAt),
    }))
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .map(normalizeNotification);

  const directMessages = threadDocs
    .map((d) => ({
      ...d,
      updatedAtMs: toMillis(d.updatedAt || d.createdAt),
    }))
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
    .map((d) => normalizeThread(d, userId));

  return { notifications, directMessages };
}

// ─── Outfit Collections ───────────────────────────────────────────────────────

export async function createOutfitCollection(userId, name) {
  const docRef = await addDoc(collection(db, 'outfitCollections'), {
    userId,
    name: name.trim(),
    outfitIds: [],
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getOutfitCollections(userId) {
  const q = query(
    collection(db, 'outfitCollections'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addOutfitToCollection(collectionId, outfitId) {
  await updateDoc(doc(db, 'outfitCollections', collectionId), {
    outfitIds: arrayUnion(outfitId),
  });
}

export async function removeOutfitFromCollection(collectionId, outfitId) {
  await updateDoc(doc(db, 'outfitCollections', collectionId), {
    outfitIds: arrayRemove(outfitId),
  });
}

export async function renameOutfitCollection(collectionId, name) {
  await updateDoc(doc(db, 'outfitCollections', collectionId), { name: name.trim() });
}

export async function deleteOutfitCollection(collectionId) {
  await deleteDoc(doc(db, 'outfitCollections', collectionId));
}
