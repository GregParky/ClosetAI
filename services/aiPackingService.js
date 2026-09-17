const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;

function parseJSON(text) {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

async function callGroq(prompt, maxTokens = 1024) {
  if (!GROQ_API_KEY) throw new Error('Missing EXPO_PUBLIC_GROQ_API_KEY');
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`Groq API error: ${await response.text()}`);
  const data = await response.json();
  return data.choices[0].message.content;
}

export async function generatePackingList({ closetItems, destination, days, occasion }) {
  const itemList = closetItems.map((item) => ({
    id: item.id,
    name: item.name || item.type || 'Unnamed',
    category: item.category || 'unassigned',
    color: item.color || 'unknown',
  }));

  const prompt = `You are a travel packing assistant. Generate a smart packing list for a ${days}-day ${occasion} trip to ${destination}.

Use items from the user's closet where possible. Mark items as fromCloset: true if you reference a specific closet item by ID, otherwise false.

User's closet:
${JSON.stringify(itemList, null, 2)}

Rules:
- Only reference item IDs that exist in the list above
- Suggest enough outfits for ${days} days (account for re-wearing basics)
- Include toiletries, accessories, and travel essentials as fromCloset: false
- Keep each section to 4-6 items max

Respond with ONLY valid JSON:
{
  "sections": [
    {
      "category": "Tops",
      "items": [
        { "name": "White linen shirt", "fromCloset": true, "itemId": "abc123" },
        { "name": "Basic white tee", "fromCloset": true, "itemId": "def456" }
      ]
    }
  ],
  "tips": ["Pack light — aim for 1 bag", "Choose versatile neutrals"]
}`;

  const raw = await callGroq(prompt, 1200);
  return parseJSON(raw);
}

export async function analyzeWardrobeGaps({ closetItems }) {
  const summary = {};
  for (const item of closetItems) {
    const cat = item.category || 'unassigned';
    summary[cat] = (summary[cat] || 0) + 1;
  }

  const prompt = `You are a wardrobe analyst. Based on this closet inventory, identify the 4-5 most important missing wardrobe essentials.

Closet inventory by category:
${JSON.stringify(summary, null, 2)}
Total items: ${closetItems.length}

Consider common wardrobe gaps like: versatile shoes, a quality layer, neutral basics, formal options, etc.

Respond with ONLY valid JSON:
{
  "gaps": [
    {
      "item": "White button-down shirt",
      "reason": "A crisp white shirt works for casual, smart-casual, and business looks.",
      "category": "tops",
      "priority": "high"
    }
  ]
}`;

  const raw = await callGroq(prompt, 600);
  return parseJSON(raw);
}
