import * as FileSystem from 'expo-file-system/legacy';

const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;

function getMimeType(uri) {
  const ext = uri.split('.').pop().toLowerCase().split('?')[0];
  return ext === 'png' ? 'image/png' : 'image/jpeg';
}

function parseJSON(text) {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

export async function analyzeClothingImage(imageUri) {
  if (!GROQ_API_KEY) throw new Error('Missing EXPO_PUBLIC_GROQ_API_KEY');

  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const mimeType = getMimeType(imageUri);

  const prompt = `Analyze this clothing item and respond with ONLY valid JSON, no other text:
{
  "name": "descriptive item name (e.g. White linen button-down shirt)",
  "color": "primary color (e.g. Navy Blue)",
  "category": "one of: tops, bottoms, outerwear, one_piece, footwear, accessories, undergarments",
  "style": "one of: casual, smart casual, business casual, formal, athletic"
}`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Vision API error: ${err}`);
  }

  const data = await response.json();
  return parseJSON(data.choices[0].message.content);
}
