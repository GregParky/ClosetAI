// firebase/firestoreService.js
import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  arrayUnion,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
} from 'firebase/firestore';
import { db } from './firebaseConfig'; // note: now ./firebaseConfig (same folder)

/**
 * Add a clothing item to the user's closet
 * @param {string} userId - The authenticated user ID
 * @param {Object} item - Clothing item object
 * @returns {Promise<string>} The new document ID
 */
export async function addClothingItem(userId, item) {
  try {
    const docRef = await addDoc(collection(db, 'closets'), {
      userId,
      ...item, // name, type, imageUrl, color, etc.
      createdAt: new Date(),
    });
    return docRef.id;
  } catch (err) {
    console.error('Error adding clothing item:', err);
    throw err;
  }
}

/**
 * Get all clothing items for a specific user
 * @param {string} userId - The authenticated user ID
 * @returns {Promise<Array>} Array of clothing items
 */
export async function getUserCloset(userId) {
  try {
    const q = query(collection(db, 'closets'), where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('Error fetching closet:', err);
    throw err;
  }
}

/**
 * Delete a clothing item from the closet
 * @param {string} docId - The Firestore document ID to delete
 */
export async function deleteClothingItem(docId) {
  try {
    await deleteDoc(doc(db, 'closets', docId));
  } catch (err) {
    console.error('Error deleting item:', err);
    throw err;
  }
}

/**
 * Save user preferences (e.g., style, temperature comfort, etc.)
 * @param {string} userId
 * @param {Object} preferences
 */
export async function saveUserPreferences(userId, preferences) {
  try {
    await setDoc(doc(db, 'preferences', userId), preferences, { merge: true });
  } catch (err) {
    console.error('Error saving preferences:', err);
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
    const docRef = doc(db, 'preferences', userId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
  } catch (err) {
    console.error('Error fetching preferences:', err);
    throw err;
  }
}