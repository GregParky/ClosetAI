/**
 * Crops a clothing item photo to show only the single primary front-facing
 * view of the garment before it is saved to the closet, and flags photos
 * that show multiple DIFFERENT clothing items (e.g. a full outfit/set)
 * so they can be rejected rather than saved as one item.
 *
 * Problem it solves:
 *   Product listing photos often show front+back side-by-side (landscape/square)
 *   or multiple stacked angles (tall portrait). Lifestyle/model shots may have
 *   complex backgrounds or show the whole body rather than just the garment.
 *   Flat-lay or outfit photos may show several distinct garments at once.
 *   All of these create visual noise in the silhouette comparison view, or
 *   result in one closet item that's actually several garments.
 *
 * Approach:
 *   1. Resize to 512 px wide for the vision API (keeps tokens small).
 *   2. Ask the Groq vision model for crop bounds AND whether the image shows
 *      multiple distinct garments.
 *   3. Apply the crop to the ORIGINAL high-res image with expo-image-manipulator.
 *   4. Fall back silently to the original URI / "single item" on any failure.
 */

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';

const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;

const PROMPT = `This image may show a clothing item in one of these formats:
- Front+back side by side (landscape or square) → crop to the LEFT half (front view)
- Multiple angles stacked vertically (tall portrait) → crop to the TOP view only
- Single clean garment photo → use the full image
- Full-body or lifestyle photo → crop tightly to just the main garment

Also decide: does this image show MULTIPLE DIFFERENT clothing items — e.g. a top AND
bottoms, a full outfit/set, or separate garments of different types laid out together?
Showing the SAME garment from multiple angles, or a multi-pack of IDENTICAL items,
does NOT count as multiple different items — answer false for those.

Return ONLY this JSON, no other text:
{"left": 0.0, "top": 0.0, "right": 1.0, "bottom": 1.0, "multipleItems": false}`;

function getImageSize(uri) {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (w, h) => resolve({ w, h }),
      ()      => resolve({ w: 0, h: 0 })
    );
  });
}

async function analyzeGarmentImage(imageUri) {
  if (!GROQ_API_KEY) return { bounds: null, multipleItems: false };

  // Resize first so the base64 payload stays small
  const small = await manipulateAsync(
    imageUri,
    [{ resize: { width: 512 } }],
    { compress: 0.8, format: SaveFormat.JPEG, base64: true }
  );

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 80,
      temperature: 0,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${small.base64}` } },
          { type: 'text', text: PROMPT },
        ],
      }],
    }),
  });

  if (!response.ok) return { bounds: null, multipleItems: false };

  const data = await response.json();
  const text = (data.choices?.[0]?.message?.content ?? '').trim();

  try {
    const match = text.match(/\{[^}]+\}/);
    if (!match) return { bounds: null, multipleItems: false };
    const b = JSON.parse(match[0]);

    const multipleItems = b.multipleItems === true;

    if (
      typeof b.left !== 'number' || typeof b.top !== 'number' ||
      typeof b.right !== 'number' || typeof b.bottom !== 'number'
    ) return { bounds: null, multipleItems };

    // Clamp to valid range
    const left   = Math.max(0, Math.min(0.95, b.left));
    const top    = Math.max(0, Math.min(0.95, b.top));
    const right  = Math.max(left + 0.05, Math.min(1, b.right));
    const bottom = Math.max(top  + 0.05, Math.min(1, b.bottom));

    // Skip crop if the model is essentially returning the full image
    const isAlreadyFull = left < 0.04 && top < 0.04 && right > 0.96 && bottom > 0.96;

    return { bounds: isAlreadyFull ? null : { left, top, right, bottom }, multipleItems };
  } catch {
    return { bounds: null, multipleItems: false };
  }
}

async function applyCrop(imageUri, bounds) {
  const { w, h } = await getImageSize(imageUri);
  if (w === 0 || h === 0) return imageUri;

  const originX = Math.floor(bounds.left  * w);
  const originY = Math.floor(bounds.top   * h);
  const width   = Math.ceil((bounds.right  - bounds.left)  * w);
  const height  = Math.ceil((bounds.bottom - bounds.top)   * h);

  if (width < 60 || height < 60) return imageUri;

  const result = await manipulateAsync(
    imageUri,
    [{ crop: { originX, originY, width, height } }],
    { compress: 0.92, format: SaveFormat.JPEG }
  );

  return result.uri;
}

/**
 * Analyzes a clothing photo before it's added to the closet.
 * Returns:
 *   - multipleItems: true if the photo shows several different garments
 *     (e.g. a full outfit) and should be rejected as a single closet item.
 *   - croppedUri: the photo cropped to a single primary view (or the
 *     original URI if no crop was needed/possible).
 * Always resolves — never throws.
 */
export async function analyzeGarmentPhoto(imageUri) {
  try {
    const { bounds, multipleItems } = await analyzeGarmentImage(imageUri);
    if (multipleItems) return { multipleItems: true, croppedUri: imageUri };
    if (!bounds) return { multipleItems: false, croppedUri: imageUri };

    const croppedUri = await applyCrop(imageUri, bounds);
    return { multipleItems: false, croppedUri };
  } catch (err) {
    console.warn('[garmentCrop] analysis failed, using original:', err.message);
    return { multipleItems: false, croppedUri: imageUri };
  }
}

/**
 * Returns a cropped local URI showing only the primary garment view.
 * Always resolves — returns the original URI on any failure.
 */
export async function cropToSingleGarmentView(imageUri) {
  const { croppedUri } = await analyzeGarmentPhoto(imageUri);
  return croppedUri;
}
