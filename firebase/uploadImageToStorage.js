// firebase/uploadImageToStorage.js
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebaseConfig';

/**
 * Upload an image (file:// URI) to Firebase Storage and return its download URL.
 *
 * IMPORTANT:
 * - This function ALWAYS uploads to: clothing/{userId}/{filename}
 * - That matches these Storage rules:
 *   match /clothing/{userId}/{allPaths=**} {
 *     allow read, write: if request.auth != null && request.auth.uid == userId;
 *   }
 *
 * NOTE:
 * - Base64 fallback intentionally removed.
 */
export async function uploadImageToStorage(uri, { userId } = {}) {
  try {
    if (!uri) throw new Error('uploadImageToStorage: missing uri');
    if (!userId) throw new Error('uploadImageToStorage: missing userId');

    // Infer extension best-effort (some ImagePicker URIs may not contain an extension)
    const lower = String(uri).toLowerCase();
    const ext =
      lower.includes('.png') ? 'png' :
      lower.includes('.webp') ? 'webp' :
      lower.includes('.heic') ? 'heic' :
      lower.includes('.jpeg') ? 'jpeg' :
      lower.includes('.jpg') ? 'jpg' :
      'jpg';

    // Use safe content types. HEIC can be finicky across environments, so use octet-stream.
    const contentType =
      ext === 'png' ? 'image/png' :
      ext === 'webp' ? 'image/webp' :
      ext === 'jpeg' ? 'image/jpeg' :
      ext === 'jpg' ? 'image/jpeg' :
      'application/octet-stream';

    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    // ✅ MUST match your Storage rules
    const path = `clothing/${userId}/${filename}`;

    console.log('uploadImageToStorage: start', { uri, path, ext, contentType });

    const storageRef = ref(storage, path);

    // Fetch the file:// URI into a blob (works in Expo dev builds)
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`uploadImageToStorage: fetch failed (${response.status})`);
    }

    const blob = await response.blob();

    await uploadBytes(storageRef, blob, { contentType });

    const downloadURL = await getDownloadURL(storageRef);

    console.log('uploadImageToStorage: success', { path });
    return downloadURL;
  } catch (err) {
    console.error('uploadImageToStorage: error uploading image:', err);
    throw err;
  }
}
