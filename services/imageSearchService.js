const SERP_KEY = process.env.EXPO_PUBLIC_SERP_KEY;

/**
 * Search for product images using SerpApi (Google Shopping).
 * Returns clean, white-background product shots from real retailers.
 * Free tier: 100 searches/month — no credit card needed.
 *
 * ONE-TIME SETUP:
 *   1. Go to serpapi.com → click "Register"
 *   2. Create a free account (email + password, no billing)
 *   3. Your API key is on the dashboard — copy it
 *   4. Add to .env:  EXPO_PUBLIC_SERP_KEY=your_key_here
 */
export async function searchClothingImages(query, count = 24) {
  if (!SERP_KEY) {
    throw new Error('MISSING_KEY');
  }

  const url =
    `https://serpapi.com/search.json` +
    `?engine=google_shopping` +
    `&q=${encodeURIComponent(query)}` +
    `&api_key=${SERP_KEY}` +
    `&num=20`;

  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SerpApi error ${res.status}: ${text}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return (data.shopping_results || [])
    .filter((item) => item.thumbnail)
    .slice(0, count)
    .map((item) => ({
      thumbnailUrl: item.thumbnail,
      contentUrl:   item.thumbnail,   // use thumbnail as download source
      name:         item.title || query,
      width:        0,
      height:       0,
      source:       item.source || '',
      price:        item.price  || '',
    }));
}
