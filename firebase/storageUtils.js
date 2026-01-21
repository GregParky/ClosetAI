// firebase/storageUtils.js
import { storage } from './firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// uri: local image URI from ImagePicker
// userId: Firebase auth user uid (you can pass null for now if you’re not using it yet)
export async function uploadClothingImage(uri, userId = 'anonymous') {
  try {
    // Convert local file URI to blob (Expo-friendly)
    const response = await fetch(uri);
    const blob = await response.blob();

    const fileName = `${Date.now()}.jpg`;
    const imageRef = ref(storage, `clothing/${userId}/${fileName}`);

    await uploadBytes(imageRef, blob);
    const downloadURL = await getDownloadURL(imageRef);

    return downloadURL; // you can save this in Firestore later
  } catch (err) {
    console.error('Error uploading image:', err);
    throw err;
  }
}