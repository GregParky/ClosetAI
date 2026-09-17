import { Platform } from 'react-native';

const APP_GROUP  = 'group.com.gregpark.closetai';
const OUTFIT_KEY = 'todayOutfit';

// Lazy-load so Android and Expo Go don't crash on the missing native module
let _prefs = null;
function getPrefs() {
  if (_prefs) return _prefs;
  try {
    _prefs = require('react-native-shared-group-preferences').default;
  } catch {
    // package not linked (Expo Go, Android)
  }
  return _prefs;
}

/**
 * Serialise the first AI-generated outfit and write it to the App Group
 * UserDefaults container so the iOS home-screen widget can read it without
 * opening the app.
 *
 * Shape written (must match WidgetOutfit in ClosetAIWidget.swift):
 *   { outfitName, items: [{ slot, type, color }], generatedAt }
 */
export async function writeOutfitToWidget(outfit) {
  if (Platform.OS !== 'ios') return;

  const prefs = getPrefs();
  if (!prefs) return;

  try {
    const SLOT_ORDER = ['layer', 'onePiece', 'top', 'bottom', 'shoes'];
    const items = SLOT_ORDER
      .map((slot) => {
        const item = outfit[slot];
        if (!item) return null;
        return { slot, type: item.type || slot, color: item.color || 'Grey' };
      })
      .filter(Boolean);

    const payload = {
      outfitName:  outfit.name || "Today's Outfit",
      items,
      generatedAt: new Date().toISOString().slice(0, 10),
    };

    await prefs.setItem(OUTFIT_KEY, JSON.stringify(payload), APP_GROUP);
  } catch (err) {
    // Non-fatal — widget just shows the empty state until next write
    console.warn('[WidgetService] write failed:', err.message);
  }
}
