// firebase/uploadImageToStorage.js
// Utility for uploading a local image (from Expo ImagePicker/Camera) to Firebase Storage

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebaseConfig';

/**
 * Upload a local image file (e.g. from Expo ImagePicker) to Firebase Storage.
 *
 * @param {string} uri - Local file URI (e.g. "file:///...").
 * @param {Object} options
 * @param {string} [options.folder='uploads'] - Folder in Storage to save the image under.
 * @param {string} [options.userId='anonymous'] - Used to nest files per user.
 * @param {string} [options.fileName] - Optional custom filename. If omitted, a timestamp-based name is generated.
 *
 * @returns {Promise<string>} - The public download URL of the uploaded image.
 */
export async function uploadImageToStorage(
  uri,
  {
    folder = 'uploads',
    userId = 'anonymous',
    fileName,
  } = {}
) {
  if (!uri) {
    throw new Error('uploadImageToStorage: "uri" is required');
  }

  try {
    // 1. Convert the local file URI to a blob (Expo-friendly)
    const response = await fetch(uri);
    const blob = await response.blob();

    // 2. Build a Storage path like: `${folder}/${userId}/1733260273948.jpg`
    const extension = guessFileExtensionFromBlob(blob) || 'jpg';
    const finalFileName = fileName || `${Date.now()}.${extension}`;
    const storagePath = `${folder}/${userId}/${finalFileName}`;

    const storageRef = ref(storage, storagePath);

    // 3. Upload the blob to Firebase Storage
    await uploadBytes(storageRef, blob);

    // 4. Get a public download URL for that file
    const downloadURL = await getDownloadURL(storageRef);

    return downloadURL;
  } catch (err) {
    console.error('uploadImageToStorage: error uploading image:', err);
    throw err;
  }
}

/**
 * Try to guess a reasonable file extension from the blob's MIME type.
 * Falls back to "jpg" if unknown.
 *
 * @param {Blob} blob
 * @returns {string | null}
 */
function guessFileExtensionFromBlob(blob) {
  if (!blob || !blob.type) return null;

  const mime = blob.type.toLowerCase();

  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/heic') return 'heic';
  if (mime === 'image/webp') return 'webp';

  return null;
}
