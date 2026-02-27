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