import * as FileSystem from 'expo-file-system/legacy';
import { getUserCloset, updateClothingItem, refreshSavedOutfitSnapshots } from '../firebase/firestoreService';
import { uploadImageToStorage } from '../firebase/uploadImageToStorage';
import { removeBackgroundAndUpload } from './backgroundRemovalService';
import { cropToSingleGarmentView } from './garmentCropService';

/**
 * One-time migration: re-crop and re-upload every existing closet item's
 * photo through the garment crop pipeline so multi-view product shots get
 * isolated to a single front view.
 *
 * @param {string} userId
 * @param {(done: number, total: number, label: string) => void} onProgress
 * @returns {Promise<{ total: number, updated: number, failed: number }>}
 */
export async function reprocessClosetPhotos(userId, onProgress) {
  const items = await getUserCloset(userId);
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(i, items.length, item.name || item.category || 'item');

    if (!item.imageUrl) continue;

    const tmpPath = `${FileSystem.cacheDirectory}reprocess_${Date.now()}_${i}.jpg`;
    let croppedUri = null;

    try {
      await FileSystem.downloadAsync(item.imageUrl, tmpPath);

      croppedUri = await cropToSingleGarmentView(tmpPath);
      const wasCropped = croppedUri && croppedUri !== tmpPath;
      const needsCutout = !item.cutoutUrl;

      if (!wasCropped && !needsCutout) {
        // Nothing to crop and a cutout already exists — leave this item untouched.
        continue;
      }

      const sourceUri = wasCropped ? croppedUri : tmpPath;
      const patch = {};

      if (wasCropped) {
        patch.imageUrl = await uploadImageToStorage(sourceUri, { userId });
      }

      const newCutoutUrl = await removeBackgroundAndUpload(sourceUri, userId).catch(() => null);
      if (newCutoutUrl) {
        patch.cutoutUrl = newCutoutUrl;
      } else if (wasCropped) {
        patch.cutoutUrl = item.cutoutUrl || null;
      }

      if (Object.keys(patch).length === 0) continue;

      await updateClothingItem(item.id, patch);
      updated++;
    } catch (err) {
      console.warn(`[reprocessClosetPhotos] failed for item ${item.id}:`, err.message);
      failed++;
    } finally {
      FileSystem.deleteAsync(tmpPath, { idempotent: true }).catch(() => {});
      if (croppedUri && croppedUri !== tmpPath) {
        FileSystem.deleteAsync(croppedUri, { idempotent: true }).catch(() => {});
      }
    }
  }

  onProgress?.(items.length, items.length, 'Syncing saved outfits…');
  const { updated: outfitsUpdated } = await refreshSavedOutfitSnapshots(userId);

  onProgress?.(items.length, items.length, 'Done');
  return { total: items.length, updated, failed, outfitsUpdated };
}
