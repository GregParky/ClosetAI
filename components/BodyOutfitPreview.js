import React, { useEffect, useRef, useState } from 'react';
import { View, Image, StyleSheet, Text, ActivityIndicator } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { generateOutfitTryOn } from '../services/virtualTryOnService';

// ─── Silhouette masks per body part ───────────────────────────────────────────
// Each build type has 4 PNGs: full body (for the gray fill), plus dedicated
// torso / lower-body / shoes masks. Using a per-part mask means pants are
// clipped to the leg shape and shoes to the foot shape rather than everything
// being squeezed through the narrow foot pixels of the full silhouette mask.
// Pixel analysis of the 200×500 PNGs:
//   torso mask opaque: 12–42%  |  lower mask: 38–86%  |  shoes mask: 84–91%
const SILHOUETTES = {
  slim: {
    full:  require('../assets/silhouettes/slim.png'),
    torso: require('../assets/silhouettes/slim_torso.png'),
    lower: require('../assets/silhouettes/slim_lower.png'),
    shoes: require('../assets/silhouettes/slim_shoes.png'),
  },
  athletic: {
    full:  require('../assets/silhouettes/athletic.png'),
    torso: require('../assets/silhouettes/athletic_torso.png'),
    lower: require('../assets/silhouettes/athletic_lower.png'),
    shoes: require('../assets/silhouettes/athletic_shoes.png'),
  },
  average: {
    full:  require('../assets/silhouettes/average.png'),
    torso: require('../assets/silhouettes/average_torso.png'),
    lower: require('../assets/silhouettes/average_lower.png'),
    shoes: require('../assets/silhouettes/average_shoes.png'),
  },
  curvy: {
    full:  require('../assets/silhouettes/curvy.png'),
    torso: require('../assets/silhouettes/curvy_torso.png'),
    lower: require('../assets/silhouettes/curvy_lower.png'),
    shoes: require('../assets/silhouettes/curvy_shoes.png'),
  },
};

const ASPECT = 200 / 500; // silhouette source is 200×500

// ─── Color fallback ───────────────────────────────────────────────────────────
const COLOR_KEYWORDS = {
  black: '#1a1a1a',   white: '#f0f0f0',   grey: '#9ca3af',   gray: '#9ca3af',
  red: '#ef4444',     blue: '#3b82f6',     green: '#22c55e',  yellow: '#facc15',
  orange: '#f97316',  purple: '#a855f7',   pink: '#ec4899',   brown: '#92400e',
  navy: '#1e3a5f',    teal: '#0d9488',     olive: '#6b7228',  khaki: '#c3b091',
  beige: '#e8d5b0',   cream: '#fffdd0',    tan: '#d2b48c',    maroon: '#800000',
  burgundy: '#800020', charcoal: '#36454f', mint: '#98ff98',   coral: '#ff6b6b',
  lavender: '#e6d4f0', indigo: '#4f46e5',  camel: '#c19a6b',  ivory: '#fffff0',
  sand: '#c2b280',    rust: '#b7410e',     sage: '#8fac72',   slate: '#64748b',
  denim: '#1560bd',   gold: '#ffd700',     silver: '#c0c0c0', lilac: '#c8a2c8',
};

function parseColor(str) {
  if (!str) return '#9ca3af';
  const lower = str.toLowerCase().replace(/[^a-z ]/g, '').trim();
  if (COLOR_KEYWORDS[lower]) return COLOR_KEYWORDS[lower];
  for (const w of lower.split(/\s+/)) {
    if (COLOR_KEYWORDS[w]) return COLOR_KEYWORDS[w];
  }
  return '#9ca3af';
}

// ─── Per-zone clothing box ────────────────────────────────────────────────────
// Renders one clothing item as an absolutely-positioned image at [top, top+zoneHeight].
// The parent PartMaskedZone supplies the body-shape clip; this just sizes/positions
// the image so it fills the right slice of the silhouette.
function ClothingZone({ item, uri, top, zoneHeight, containerW, mode = 'cover', fillWhenEmpty = true }) {
  if (!item) return null;
  if (!uri && !fillWhenEmpty) return null;

  const color = parseColor(item.color);

  return (
    <View
      style={{
        position: 'absolute',
        top,
        left: 0,
        width: containerW,
        height: zoneHeight,
        backgroundColor: uri ? 'transparent' : color,
        overflow: 'hidden',
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: containerW, height: zoneHeight }}
          resizeMode={mode}
        />
      ) : null}
    </View>
  );
}

// ─── Per-body-part mask wrapper ───────────────────────────────────────────────
// Wraps children in a MaskedView that clips to the alpha of the given mask PNG.
// Each body part (torso, lower, shoes) has its own PNG so the clip matches the
// actual arm/leg/foot shape rather than forcing everything through one mask.
function PartMaskedZone({ maskSource, width, height, children }) {
  return (
    <MaskedView
      style={[StyleSheet.absoluteFill, { width, height }]}
      maskElement={
        <View style={{ width, height, backgroundColor: 'transparent' }}>
          <Image source={maskSource} style={{ width, height }} resizeMode="stretch" />
        </View>
      }
    >
      <View style={{ width, height }}>
        {children}
      </View>
    </MaskedView>
  );
}

// ─── Silhouette view ───────────────────────────────────────────────────────────
// Each clothing slot uses the dedicated mask PNG for that body part:
//   torso PNG (12–42%)  →  top / layer / onePiece-upper
//   lower PNG (38–86%)  →  bottom / onePiece-lower
//   shoes PNG (84–91%)  →  shoes
// This means pants get clipped to the leg shape and shoes to the foot shape,
// instead of everything being squeezed through one full-body mask.
function SilhouetteView({ outfit, buildType, width }) {
  const sil         = SILHOUETTES[buildType] || SILHOUETTES.average;
  const height      = width / ASPECT;
  const hasOnePiece = !!outfit?.onePiece;
  const topItem     = outfit?.onePiece ?? outfit?.top;

  // Zone boundaries matched to opaque regions in the mask PNGs (pixel-analysed)
  const torsoTop   = height * 0.12;   // torso mask: 12–42%
  const torsoH     = height * 0.30;
  const lowerTop   = height * 0.38;   // lower mask: 38–86%
  const lowerH     = height * 0.48;
  const onePieceH  = lowerTop + lowerH - torsoTop;  // 12–86%

  // Shoe oval mask is 7% tall × 63% wide — too flat to render a photo legibly.
  // Strategy: fill the oval with the shoe color (so the silhouette looks "worn"),
  // then overlay the actual photo at a proportional size centred at the feet.
  // Cutout (transparent bg) renders cleanly outside the mask. ImageUrl-only
  // shoes fall back to color fill only to avoid background bleeding.
  // shoe mask opaque region: 84–91% (oval, 7% tall × 63% wide)
  const shoeImgH      = height * 0.16;    // photo rendered at ~2× the oval height
  const shoeImgW      = width  * 0.70;
  const shoeImgTop    = height * 0.875 - shoeImgH / 2;  // centred on the oval
  const shoeImgLeft   = (width - shoeImgW) / 2;

  const topUri    = topItem        ? (topItem.cutoutUrl       || topItem.imageUrl       || null) : null;
  const bottomUri = outfit?.bottom ? (outfit.bottom.cutoutUrl || outfit.bottom.imageUrl || null) : null;
  const layerUri  = outfit?.layer  ? (outfit.layer.cutoutUrl  || outfit.layer.imageUrl  || null) : null;

  return (
    <View style={{ width, height }}>
      {/* Gray body fill — full silhouette mask, shows on head/neck */}
      <PartMaskedZone maskSource={sil.full} width={width} height={height}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#c8c8d2' }]} />
      </PartMaskedZone>

      {/* Top / upper half of one-piece — torso mask */}
      {topItem && (
        <PartMaskedZone maskSource={sil.torso} width={width} height={height}>
          <ClothingZone
            item={topItem}
            uri={topUri}
            top={torsoTop}
            zoneHeight={hasOnePiece ? onePieceH : torsoH}
            containerW={width}
          />
        </PartMaskedZone>
      )}

      {/* Lower half of one-piece — lower mask */}
      {hasOnePiece && topItem && (
        <PartMaskedZone maskSource={sil.lower} width={width} height={height}>
          <ClothingZone
            item={topItem}
            uri={topUri}
            top={torsoTop}
            zoneHeight={onePieceH}
            containerW={width}
          />
        </PartMaskedZone>
      )}

      {/* Bottom — lower mask gives correct leg shape */}
      {!hasOnePiece && outfit?.bottom && (
        <PartMaskedZone maskSource={sil.lower} width={width} height={height}>
          <ClothingZone
            item={outfit.bottom}
            uri={bottomUri}
            top={lowerTop}
            zoneHeight={lowerH}
            containerW={width}
          />
        </PartMaskedZone>
      )}

      {/* Shoes: photo inside the oval mask + optional full-size cutout overlay */}
      {outfit?.shoes && (() => {
        const cutout  = outfit.shoes.cutoutUrl  || null;
        const regular = outfit.shoes.imageUrl   || null;
        const anyUri  = cutout || regular;
        return (
          <>
            {/* Shoe oval — shows the photo (or color fill) clipped to the foot shape */}
            <PartMaskedZone maskSource={sil.shoes} width={width} height={height}>
              {anyUri ? (
                <Image
                  source={{ uri: anyUri }}
                  style={{
                    position: 'absolute',
                    top: shoeImgTop,
                    left: shoeImgLeft,
                    width: shoeImgW,
                    height: shoeImgH,
                  }}
                  resizeMode="contain"
                />
              ) : (
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: parseColor(outfit.shoes.color) },
                  ]}
                />
              )}
            </PartMaskedZone>

            {/* Cutout overlay — if transparent bg available, also render at full
                legible size outside the mask so the whole shoe is visible */}
            {cutout ? (
              <Image
                source={{ uri: cutout }}
                style={{
                  position: 'absolute',
                  top: shoeImgTop,
                  left: shoeImgLeft,
                  width: shoeImgW,
                  height: shoeImgH,
                }}
                resizeMode="contain"
              />
            ) : null}
          </>
        );
      })()}

      {/* Layer / outerwear — torso mask, on top of everything */}
      {outfit?.layer && (
        <PartMaskedZone maskSource={sil.torso} width={width} height={height}>
          <ClothingZone
            item={outfit.layer}
            uri={layerUri}
            top={torsoTop}
            zoneHeight={torsoH}
            containerW={width}
          />
        </PartMaskedZone>
      )}
    </View>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function BodyOutfitPreview({ outfit, bodyProfile, width, cached, onTryonReady }) {
  const { user } = useAuth();
  const buildType  = bodyProfile?.buildType ?? 'average';
  const modelPhoto = bodyProfile?.modelPhotoUrl ?? null;
  const height     = width / ASPECT;

  const outfitKey = [
    modelPhoto?.slice(-12),
    outfit?.top?.id,
    outfit?.bottom?.id,
    outfit?.onePiece?.id,
    outfit?.layer?.id,
    outfit?.shoes?.id,
  ].filter(Boolean).join('-');

  const [tryonUrl,   setTryonUrl]   = useState(cached?.outfitKey === outfitKey ? cached.tryonUrl : null);
  const [generating, setGenerating] = useState(false);
  const [progress,   setProgress]   = useState({ step: 0, total: 0 });
  const [error,      setError]      = useState(null);
  const generatingRef = useRef(false);

  useEffect(() => {
    if (!modelPhoto || tryonUrl || generatingRef.current) return;
    const hasItem = ['top', 'bottom', 'onePiece', 'layer', 'shoes'].some((s) => outfit?.[s]?.imageUrl);
    if (!hasItem) return;

    generatingRef.current = true;
    setGenerating(true);
    setError(null);

    generateOutfitTryOn(user.uid, modelPhoto, outfit, (step, total) => {
      setProgress({ step, total });
    })
      .then((url) => {
        setTryonUrl(url);
        onTryonReady?.(url, outfitKey);
      })
      .catch((err) => {
        console.warn('Virtual try-on failed:', err.message);
        setError(err.message);
      })
      .finally(() => {
        setGenerating(false);
        generatingRef.current = false;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outfitKey]);

  if (!modelPhoto) {
    return <SilhouetteView outfit={outfit} buildType={buildType} width={width} />;
  }

  if (tryonUrl) {
    return (
      <View style={{ width, height }}>
        <Image source={{ uri: tryonUrl }} style={{ width, height }} resizeMode="cover" />
      </View>
    );
  }

  if (generating) {
    return (
      <View style={[styles.statusBox, { width, height }]}>
        <ActivityIndicator size="large" color="#111" />
        <Text style={styles.statusText}>
          {progress.total > 0 ? `Dressing item ${progress.step}/${progress.total}…` : 'Generating try-on…'}
        </Text>
        <Text style={styles.statusHint}>~20s per item</Text>
      </View>
    );
  }

  return (
    <View style={{ width }}>
      <SilhouetteView outfit={outfit} buildType={buildType} width={width} />
      {error && (
        <View style={styles.errorChip}>
          <Ionicons name="alert-circle-outline" size={12} color="#e0374a" />
          <Text style={styles.errorText}>Try-on failed</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  statusBox: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f9f9f9', borderRadius: 12, overflow: 'hidden',
  },
  statusText: { marginTop: 12, fontSize: 13, fontWeight: '600', color: '#333' },
  statusHint: { marginTop: 4, fontSize: 11, color: '#888' },
  errorChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'center', marginTop: 4,
    backgroundColor: '#fff0f0', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  errorText: { fontSize: 11, color: '#e0374a' },
});
