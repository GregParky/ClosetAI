import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/firebaseConfig';

const REPLICATE_TOKEN = process.env.EXPO_PUBLIC_REPLICATE_API_KEY;

const POLL_INTERVAL_MS = 3000;
const MAX_WAIT_MS = 120_000;

// Cache the resolved version hash so we only fetch it once per session
let resolvedVersion = null;

/**
 * Fetch the latest published version of cuuupid/idm-vton from Replicate.
 * Caches the result in memory for the lifetime of the app session.
 */
async function getModelVersion() {
  if (resolvedVersion) return resolvedVersion;

  const resp = await fetch('https://api.replicate.com/v1/models/cuuupid/idm-vton/versions', {
    headers: { Authorization: `Token ${REPLICATE_TOKEN}` },
  });
  if (!resp.ok) throw new Error(`Could not fetch model versions: ${resp.status}`);
  const data = await resp.json();
  const latest = data?.results?.[0]?.id;
  if (!latest) throw new Error('No versions found for cuuupid/idm-vton');
  resolvedVersion = latest;
  return resolvedVersion;
}

async function pollUntilDone(predictionId) {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const resp = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Token ${REPLICATE_TOKEN}` },
    });
    const data = await resp.json();
    if (data.status === 'succeeded') return data.output;
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(`Try-on model failed: ${data.error || data.status}`);
    }
  }
  throw new Error('Virtual try-on timed out after 2 minutes');
}

/**
 * Run IDM-VTON for one garment on a person photo.
 *
 * @param {string} modelPhotoUrl  public URL of a full-body person photo
 * @param {string} garmentUrl     public URL of the clothing item image
 * @param {string} garmentDesc    short description, e.g. "white linen shirt"
 * @param {'upper_body'|'lower_body'|'dresses'} category
 * @returns {Promise<string>}  Replicate CDN URL of the generated image
 */
async function runVton(modelPhotoUrl, garmentUrl, garmentDesc, category) {
  if (!REPLICATE_TOKEN) throw new Error('Missing EXPO_PUBLIC_REPLICATE_API_KEY');

  const version = await getModelVersion();

  const resp = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${REPLICATE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version,
      input: {
        human_img:    modelPhotoUrl,
        garm_img:     garmentUrl,
        garment_des:  garmentDesc || 'clothing item',
        is_checked:       true,
        is_checked_crop:  false,
        denoise_steps:    30,
        seed:             42,
        category,
      },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Replicate error ${resp.status}: ${err}`);
  }

  const prediction = await resp.json();
  const output = await pollUntilDone(prediction.id);
  const outputUrl = Array.isArray(output) ? output[0] : output;
  if (!outputUrl) throw new Error('No image returned from try-on model');
  return outputUrl;
}

async function cacheToFirebase(remoteUrl, userId, cacheKey) {
  const resp = await fetch(remoteUrl);
  if (!resp.ok) throw new Error(`Could not download try-on result: ${resp.status}`);
  const blob = await resp.blob();
  const storageRef = ref(storage, `clothing/${userId}/tryon/${cacheKey}.jpg`);
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
  return getDownloadURL(storageRef);
}

function toVtonCategory(category) {
  if (!category) return 'upper_body';
  const c = String(category).toLowerCase();
  if (c === 'bottoms' || c === 'bottom') return 'lower_body';
  if (c === 'one_piece' || c === 'dress' || c === 'jumpsuit') return 'dresses';
  return 'upper_body';
}

/**
 * Generate a virtual try-on for an entire outfit by chaining garment layers:
 *   base photo → outerwear → one-piece/top → bottom
 *
 * Each step uses the output of the previous as the new person photo, so
 * all garments appear on the body at once.
 *
 * Results are cached in Firebase Storage so repeat renders are instant.
 *
 * @param {string} userId
 * @param {string} basePhotoUrl  full-body photo of the user
 * @param {object} outfit        { top, bottom, onePiece, layer, shoes }
 * @param {function} onProgress  called with (completedStep, totalSteps)
 * @returns {Promise<string>}    Firebase Storage URL of the final image
 */
export async function generateOutfitTryOn(userId, basePhotoUrl, outfit, onProgress) {
  if (!REPLICATE_TOKEN) throw new Error('Missing EXPO_PUBLIC_REPLICATE_API_KEY');

  // Build ordered step list (layer first so it goes underneath top)
  const steps = [];
  if (outfit.layer)    steps.push(outfit.layer);
  if (outfit.onePiece) steps.push(outfit.onePiece);
  if (outfit.top)      steps.push(outfit.top);
  if (outfit.bottom)   steps.push(outfit.bottom);
  // Shoes are excluded — IDM-VTON targets upper/lower body, not footwear

  if (steps.length === 0) throw new Error('No supported garments in outfit');

  let currentPhoto = basePhotoUrl;
  let completed = 0;

  for (const item of steps) {
    const garmentUrl = item.cutoutUrl || item.imageUrl;
    if (!garmentUrl) continue;
    currentPhoto = await runVton(
      currentPhoto,
      garmentUrl,
      item.name || 'clothing item',
      toVtonCategory(item.category),
    );
    completed++;
    onProgress?.(completed, steps.length);
  }

  const outfitKey = steps.map((s) => s.id).filter(Boolean).join('_')
    + '_' + String(basePhotoUrl).slice(-8);
  return cacheToFirebase(currentPhoto, userId, `outfit_${outfitKey}`);
}
