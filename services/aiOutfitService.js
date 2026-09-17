const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;

function parseJSON(text) {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

const AESTHETIC_GUIDE = {
  Casual:       'relaxed fit, everyday basics, comfort-first. Jeans, tees, sneakers.',
  Streetwear:   'oversized silhouettes, graphic pieces, bold footwear, layering.',
  Minimalist:   'neutral palette (white/grey/black/beige), clean lines, no loud patterns.',
  Preppy:       'polished classics — Oxford shirts, chinos, loafers, blazers.',
  Athleisure:   'performance fabrics that look sharp off the gym floor. Joggers, quarter-zips.',
  Business:     'smart without stiff — blazer, button-down, slim trousers, derby shoes.',
  Formal:       'tailored, structured. Suits, dress shirts, Oxford shoes.',
};

// Each outfit slot gets a distinct brief so the 3 results feel genuinely different.
const OUTFIT_BRIEFS = [
  'a go-to, effortless look — the outfit you reach for without thinking',
  'a slightly elevated take that still feels personal — one step above the default',
  'a bolder or more unexpected combination that still works with the dress code',
];

function buildStyleGuide(styles) {
  if (!styles?.length) return 'No aesthetic preference set — use good general styling judgement.';
  const lines = styles.map((s) => {
    const guide = AESTHETIC_GUIDE[s];
    return guide ? `  • ${s}: ${guide}` : `  • ${s}`;
  });
  return `The user's preferred aesthetics are:\n${lines.join('\n')}\nPrioritise these aesthetics when choosing combinations.`;
}

function summariseItems(items) {
  // Group by category so the prompt is easier for the model to reason about.
  const groups = {};
  for (const item of items) {
    const cat = item.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push({
      id: item.id,
      name: item.name || item.type || 'item',
      color: item.color || 'unknown',
    });
  }
  const lines = [];
  for (const [cat, list] of Object.entries(groups)) {
    lines.push(`${cat.toUpperCase()}:`);
    for (const it of list) lines.push(`  id:${it.id}  "${it.name}"  color:${it.color}`);
  }
  return lines.join('\n');
}

export async function generateAIOutfits({ closetItems, temperature, preferences, dressCode, likedOutfits = [], topRatedOutfits = [] }) {
  if (!GROQ_API_KEY) throw new Error('Missing EXPO_PUBLIC_GROQ_API_KEY in .env');

  const weatherLine = temperature != null
    ? `${Math.round(temperature)}°F outside.${temperature < 45 ? ' It is cold — a warm layer is strongly recommended.' : temperature < 60 ? ' It is cool — a light layer is a good idea.' : temperature > 85 ? ' It is hot — keep it light and breathable.' : ''}`
    : 'Weather data unavailable.';

  const styleGuide = buildStyleGuide(preferences?.styles);
  const itemSummary = summariseItems(closetItems);

  const ratedSignal = topRatedOutfits.length > 0
    ? `HIGH-RATED OUTFITS FROM PAST WEARS (score ≥ 7.0 out of 10):\nThe user personally rated these outfits highly after wearing them — they reflect their strongest style preferences:\n${topRatedOutfits.map((o) => `  • "${o.outfitName}" — ${o.score}/10`).join('\n')}\nStrongly favour combinations that share the same vibe, formality, and aesthetic as these top-rated outfits.`
    : '';

  const likedSignal = likedOutfits.length > 0
    ? `TASTE SIGNALS FROM LIKED OUTFITS:\nThe user has liked these outfits from other people, which reveal their aesthetic preferences:\n${likedOutfits.map((o) => `  • "${o.outfitName}"${o.outfitDescription ? ` — ${o.outfitDescription}` : ''}`).join('\n')}\nDraw inspiration from the style and mood of these outfits — do NOT copy items from them.`
    : '';

  const idSet = new Set(closetItems.map((i) => i.id));

  const systemPrompt = `You are an expert personal stylist with 15 years of experience. You are direct, specific, and creative. You never give generic advice — every recommendation is grounded in the actual items available and the user's stated aesthetic.`;

  const userPrompt = `Generate exactly 3 outfit suggestions from the wardrobe below. Each outfit has a different brief — treat them as three genuinely distinct looks, not variations of the same one.

WEATHER: ${weatherLine}
DRESS CODE: ${dressCode}

STYLE PROFILE:
${styleGuide}
${ratedSignal ? `\n${ratedSignal}` : ''}
${likedSignal ? `\n${likedSignal}` : ''}

RULES (non-negotiable):
1. Use ONLY item IDs listed in the wardrobe — never invent an ID.
2. Every outfit MUST include shoes.
3. Every outfit MUST include either (top + bottom) OR a one_piece item.
4. No item ID may appear in more than one outfit — all 3 must use completely different pieces.
5. If it is below 60°F, include a layer/outerwear if one is available.
6. Do not default to the first few items — consider the whole wardrobe and pick the best combination for each brief.

COLOR & STYLE GUIDANCE:
- Aim for intentional color coordination (neutrals anchor, one accent piece is fine).
- The outfit name should be evocative (e.g. "Clean Monday", "Off-Duty Edit") not generic (e.g. "Outfit 1").
- The description must explain specifically WHY the combination works — color harmony, occasion fit, aesthetic match.

OUTFIT BRIEFS:
Outfit 1 — ${OUTFIT_BRIEFS[0]}
Outfit 2 — ${OUTFIT_BRIEFS[1]}
Outfit 3 — ${OUTFIT_BRIEFS[2]}

WARDROBE:
${itemSummary}

Respond with ONLY valid JSON — no markdown, no commentary:
{
  "outfits": [
    {
      "name": "evocative name",
      "description": "specific one-sentence styling note",
      "top": "item_id or null",
      "bottom": "item_id or null",
      "onePiece": "item_id or null",
      "layer": "item_id or null",
      "shoes": "item_id"
    }
  ]
}`;

  const requestBody = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 1800,
    temperature: 0.85,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  let response;
  let errText;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: requestBody,
    });

    if (response.ok) break;

    errText = await response.text();
    if (response.status !== 429) {
      throw new Error(`Groq API error: ${errText}`);
    }

    // Rate limited — wait the suggested time (or a default) and retry.
    const match = errText.match(/try again in ([\d.]+)s/);
    const waitMs = match ? Math.ceil(parseFloat(match[1]) * 1000) + 250 : 2000;
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  if (!response.ok) {
    throw new Error(`Groq API error: ${errText}`);
  }

  const data = await response.json();
  const parsed = parseJSON(data.choices[0].message.content);

  const itemMap = {};
  closetItems.forEach((item) => { itemMap[item.id] = item; });

  return parsed.outfits
    .map((outfit, idx) => {
      // Track used IDs per-outfit only — prevents the same item filling two slots
      // within a single outfit, but allows the same shoe/layer across different outfits
      // when the closet is small.
      const usedInThisOutfit = new Set();
      const resolve = (id) => {
        if (!id || !idSet.has(id) || usedInThisOutfit.has(id)) return null;
        usedInThisOutfit.add(id);
        return itemMap[id] ?? null;
      };
      const top      = resolve(outfit.top);
      const bottom   = resolve(outfit.bottom);
      const onePiece = resolve(outfit.onePiece);
      const layer    = resolve(outfit.layer);
      const shoes    = resolve(outfit.shoes);
      return {
        id: `ai-${idx}-${Date.now()}`,
        name: outfit.name,
        description: outfit.description,
        top, bottom, onePiece, layer, shoes,
      };
    })
    .filter((o) => o.shoes && (o.onePiece || (o.top && o.bottom)));
}
