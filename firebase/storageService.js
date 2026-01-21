// firebase/storageService.js

import { storage } from './firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid'; // To create unique image names

/**
 * Upload image to Firebase Storage and return public URL
 * @param {string} uri - Local file URI from ImagePicker
 * @param {string} userId - User ID to organize images
 * @returns {Promise<string>} Downloadable image URL
 */
export async function uploadClothingImage(uri, userId) {
  try {
    // Convert local file URI to blob
    const response = await fetch(uri);
    const blob = await response.blob();

    // Create storage reference
    const imageRef = ref(storage, `closets/${userId}/${uuidv4()}.jpg`);

    // Upload blob
    await uploadBytes(imageRef, blob);

    // Get public URL
    const downloadUrl = await getDownloadURL(imageRef);
    return downloadUrl;
  } catch (err) {
    console.error('Error uploading image:', err);
    throw err;
  }
}
