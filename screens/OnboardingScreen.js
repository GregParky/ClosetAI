import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../context/ThemeContext';
import { saveUserPreferences } from '../firebase/firestoreService';

const STYLES = [
  { name: 'Casual',      desc: 'Everyday basics — jeans, tees, and sneakers that feel effortless' },
  { name: 'Streetwear',  desc: 'Oversized fits, bold graphics, and statement sneakers' },
  { name: 'Minimalist',  desc: 'Clean lines, neutral tones, and nothing extra' },
  { name: 'Preppy',      desc: 'Polished classics — Oxford shirts, chinos, and loafers' },
  { name: 'Athleisure',  desc: 'Performance wear that looks sharp off the gym floor' },
  { name: 'Business',    desc: 'Smart without stiff — blazers, trousers, and clean shoes' },
  { name: 'Formal',      desc: 'Tailored and structured — suits, dress shirts, Oxford shoes' },
];

const TOTAL_STEPS = 3;

function ProgressDots({ step, colors: c }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            { backgroundColor: c.border },
            i + 1 === step && [styles.dotActive, { backgroundColor: c.text }],
          ]}
        />
      ))}
    </View>
  );
}

export default function OnboardingScreen({ navigation }) {
  const { user } = useAuth();
  const c = useColors();
  const [step, setStep] = useState(1);
  const [selectedStyles, setSelectedStyles] = useState([]);
  const [saving, setSaving] = useState(false);

  const toggleStyle = (s) => {
    setSelectedStyles((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const handleComplete = async (goToCloset = false) => {
    setSaving(true);
    try {
      if (user?.uid) {
        await saveUserPreferences(user.uid, {
          styles: selectedStyles,
          avoidDenimOnDenim: true,
          preferCasual: selectedStyles.includes('Casual'), // selectedStyles stores names
        });
        await AsyncStorage.setItem(`@onboarded_${user.uid}`, 'true');
      }
    } catch (err) {
      console.error('Onboarding save failed:', err);
    } finally {
      setSaving(false);
      if (goToCloset) {
        navigation.replace('MainTabs', { screen: 'MyCloset' });
      } else {
        navigation.replace('MainTabs');
      }
    }
  };

  if (step === 1) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <ProgressDots step={1} colors={c} />
        <View style={styles.content}>
          <Text style={styles.bigEmoji}>👗</Text>
          <Text style={[styles.headline, { color: c.text }]}>Welcome to ClosetAI</Text>
          <Text style={[styles.body, { color: c.textSecondary }]}>
            Your AI-powered personal stylist. We'll build outfits from your own wardrobe,
            tailored to the weather and your personal style.
          </Text>
          <Text style={[styles.stepHint, { color: c.textMuted }]}>It only takes a minute to get set up.</Text>
        </View>
        <Pressable style={styles.primaryBtn} onPress={() => setStep(2)}>
          <Text style={styles.primaryBtnText}>Get Started</Text>
        </Pressable>
      </View>
    );
  }

  if (step === 2) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <ProgressDots step={2} colors={c} />
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.headline, { color: c.text }]}>What's your style?</Text>
          <Text style={[styles.body, { color: c.textSecondary }]}>
            Pick as many as you like. This helps the AI suggest outfits that match your taste.
          </Text>
          <View style={styles.chipGrid}>
            {STYLES.map((s) => {
              const active = selectedStyles.includes(s.name);
              return (
                <Pressable
                  key={s.name}
                  style={[
                    styles.chip,
                    { borderColor: c.borderStrong },
                    active && styles.chipActive,
                  ]}
                  onPress={() => toggleStyle(s.name)}
                >
                  <Text style={[styles.chipName, { color: c.textSecondary }, active && styles.chipTextActive]}>
                    {s.name}
                  </Text>
                  <Text style={[styles.chipDesc, { color: active ? 'rgba(255,255,255,0.75)' : c.textMuted }]}>
                    {s.desc}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        <Pressable style={styles.primaryBtn} onPress={() => setStep(3)}>
          <Text style={styles.primaryBtnText}>
            {selectedStyles.length > 0 ? 'Next' : 'Skip for now'}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ProgressDots step={3} colors={c} />
      <View style={styles.content}>
        <Text style={styles.bigEmoji}>✨</Text>
        <Text style={[styles.headline, { color: c.text }]}>You're all set!</Text>
        <Text style={[styles.body, { color: c.textSecondary }]}>
          Now add some clothing items to your closet — the more you add, the better your outfit
          suggestions will be.
        </Text>
        <View style={[styles.tipCard, { backgroundColor: c.surfaceAlt }]}>
          <Text style={[styles.tipTitle, { color: c.text }]}>Quick tip</Text>
          <Text style={[styles.tipBody, { color: c.textSecondary }]}>
            When you add an item, AI will automatically detect its name, color, and category
            from the photo.
          </Text>
        </View>
      </View>
      {saving ? (
        <ActivityIndicator style={{ marginBottom: 16 }} />
      ) : (
        <>
          <Pressable style={styles.primaryBtn} onPress={() => handleComplete(true)}>
            <Text style={styles.primaryBtnText}>Go to My Closet</Text>
          </Pressable>
          <Pressable style={styles.ghostBtn} onPress={() => handleComplete(false)}>
            <Text style={[styles.ghostBtnText, { color: c.textMuted }]}>Skip for now</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 40,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 48,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
  },
  dotActive: { width: 24 },
  content: { flex: 1 },
  scrollArea: { flex: 1 },
  scrollContent: { paddingBottom: 16 },
  bigEmoji: { fontSize: 64, marginBottom: 20 },
  headline: { fontSize: 28, fontWeight: '800', marginBottom: 12 },
  body: { fontSize: 16, lineHeight: 24, marginBottom: 16 },
  stepHint: { fontSize: 14 },
  chipGrid: {
    flexDirection: 'column',
    gap: 8,
    marginTop: 8,
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chipActive: { borderColor: '#111', backgroundColor: '#111' },
  chipName: { fontSize: 15, fontWeight: '700' },
  chipDesc: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  chipTextActive: { color: '#fff' },
  tipCard: {
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
  },
  tipTitle: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
  tipBody: { fontSize: 13, lineHeight: 19 },
  primaryBtn: {
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  ghostBtn: { paddingVertical: 12, alignItems: 'center' },
  ghostBtnText: { fontSize: 14, fontWeight: '600' },
});
