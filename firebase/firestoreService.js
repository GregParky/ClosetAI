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
    if (!item.imageUrl) throw new Error('addClothingItem: missing item.imageUrl');

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
 * NOTE: where(userId==) + orderBy(createdAt) requires a composite index.
 * Firebase will give you a link to create it (you already saw this).
 * @param {string} userId
 * @returns {Promise<Array>} Array of clothing items
 */
export async function getUserCloset(userId) {
  try {
    if (!userId) throw new Error('getUserCloset: missing userId');

    const q = query(
      closetsRef,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
