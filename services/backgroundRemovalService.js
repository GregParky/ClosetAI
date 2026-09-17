import * as FileSystem from 'expo-file-system/legacy';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/firebaseConfig';

const REMOVEBG_API_KEY = process.env.EXPO_PUBLIC_REMOVEBG_API_KEY;

/**
 * Remove the background from a clothing image and upload the transparent PNG
 * to Firebase Storage. Returns the download URL of the cutout, or null if
 * the API key is missing or the request fails.
 *
 * @param {string} imageUri  local file:// URI of the original image
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
export async function removeBackgroundAndUpload(imageUri, userId) {
  if (!REMOVEBG_API_KEY) return null;
  if (!imageUri || !userId) return null;

  try {
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const body = JSON.stringify({
      image_file_b64: base64,
      size: 'auto',
      type: 'product',
    });

    const resp = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': REMOVEBG_API_KEY,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.warn('removeBackground API error:', resp.status, errText);
      return null;
    }

    const arrayBuffer = await resp.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    const filename = `cutout_${Date.now()}_${Math.random().toString(36).slice(2)}.png`;
    const path = `clothing/${userId}/cutouts/${filename}`;
    const storageRef = ref(storage, path);

    await uploadBytes(storageRef, uint8, { contentType: 'image/png' });
    return await getDownloadURL(storageRef);
  } catch (err) {
    console.warn('removeBackgroundAndUpload failed:', err.message);
    return null;
  }
}
