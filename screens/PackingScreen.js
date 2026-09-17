import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../context/ThemeContext';
import { getUserCloset } from '../firebase/firestoreService';
import { generatePackingList } from '../services/aiPackingService';

const OCCASIONS = ['Casual', 'Business', 'Formal', 'Beach', 'Adventure'];
const PRIORITY_COLOR = { high: '#e0374a', medium: '#f59e0b', low: '#6b7280' };

export default function PackingScreen({ navigation }) {
  const { user } = useAuth();
  const c = useColors();
  const [destination, setDestination] = useState('');
  const [days, setDays] = useState(3);
  const [occasion, setOccasion] = useState('Casual');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [checked, setChecked] = useState({});

  const handleGenerate = useCallback(async () => {
    if (!destination.trim()) {
      Alert.alert('Where are you going?', 'Please enter a destination.');
      return;
    }
    if (!user?.uid) return;
    setGenerating(true);
    setResult(null);
    setChecked({});
    try {
      const closetItems = await getUserCloset(user.uid);
      const list = await generatePackingList({
        closetItems,
        destination: destination.trim(),
        days,
        occasion,
      });
      setResult(list);
    } catch (err) {
      console.error('Packing list error:', err);
      Alert.alert('Generation failed', 'Could not generate packing list. Try again.');
    } finally {
      setGenerating(false);
    }
  }, [destination, days, occasion, user?.uid]);

  const toggleCheck = (key) => {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const totalItems = result?.sections?.reduce((acc, s) => acc + s.items.length, 0) ?? 0;
  const checkedCount = Object.values(checked).filter(Boolean).length;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.header, { color: c.text }]}>Trip Packing List</Text>
      <Text style={[styles.subtitle, { color: c.textMuted }]}>
        AI builds a packing list from your actual closet.
      </Text>

      {/* Destination */}
      <Text style={[styles.label, { color: c.textMuted }]}>Destination</Text>
      <TextInput
        style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.borderStrong, color: c.text }]}
        placeholder="e.g. Tokyo, Paris, Miami Beach"
        placeholderTextColor={c.placeholder}
        value={destination}
        onChangeText={setDestination}
        returnKeyType="done"
      />

      {/* Days */}
      <Text style={[styles.label, { color: c.textMuted }]}>Number of days</Text>
      <View style={styles.stepper}>
        <Pressable
          style={[styles.stepBtn, { borderColor: c.borderStrong }]}
          onPress={() => setDays((d) => Math.max(1, d - 1))}
        >
          <Ionicons name="remove" size={18} color={c.text} />
        </Pressable>
        <Text style={[styles.stepValue, { color: c.text }]}>{days}</Text>
        <Pressable
          style={[styles.stepBtn, { borderColor: c.borderStrong }]}
          onPress={() => setDays((d) => Math.min(30, d + 1))}
        >
          <Ionicons name="add" size={18} color={c.text} />
        </Pressable>
      </View>

      {/* Occasion */}
      <Text style={[styles.label, { color: c.textMuted }]}>Occasion</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
        {OCCASIONS.map((o) => (
          <Pressable
            key={o}
            style={[styles.pill, { borderColor: c.borderStrong }, occasion === o && styles.pillActive]}
            onPress={() => setOccasion(o)}
          >
            <Text style={[styles.pillText, { color: c.textSecondary }, occasion === o && styles.pillTextActive]}>
              {o}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Pressable
        style={[styles.generateBtn, generating && styles.generateBtnDisabled]}
        onPress={handleGenerate}
        disabled={generating}
      >
        <Text style={styles.generateBtnText}>
          {generating ? 'Building list...' : 'Generate Packing List'}
        </Text>
      </Pressable>

      {generating && (
        <View style={styles.loadingRow}>
          <ActivityIndicator />
          <Text style={[styles.loadingText, { color: c.textMuted }]}>
            AI is checking your closet...
          </Text>
        </View>
      )}

      {result && (
        <>
          <View style={styles.progressRow}>
            <Text style={[styles.progressText, { color: c.text }]}>
              {checkedCount}/{totalItems} packed
            </Text>
            {checkedCount > 0 && (
              <Pressable onPress={() => setChecked({})}>
                <Text style={[styles.clearText, { color: c.textMuted }]}>Clear</Text>
              </Pressable>
            )}
          </View>

          {result.sections?.map((section) => (
            <View key={section.category} style={styles.section}>
              <Text style={[styles.sectionTitle, { color: c.text }]}>{section.category}</Text>
              {section.items.map((item, i) => {
                const key = `${section.category}-${i}`;
                const done = !!checked[key];
                return (
                  <Pressable
                    key={key}
                    style={[styles.checkRow, { borderColor: c.border }]}
                    onPress={() => toggleCheck(key)}
                  >
                    <View style={[styles.checkbox, { borderColor: done ? '#111' : c.borderStrong, backgroundColor: done ? '#111' : 'transparent' }]}>
                      {done && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                    <View style={styles.checkInfo}>
                      <Text style={[styles.checkName, { color: done ? c.textMuted : c.text }, done && styles.checkNameDone]}>
                        {item.name}
                      </Text>
                      {item.fromCloset && (
                        <Text style={[styles.fromClosetBadge, { color: '#10b981' }]}>In your closet</Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}

          {result.tips?.length > 0 && (
            <View style={[styles.tipsCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.tipsTitle, { color: c.text }]}>Packing tips</Text>
              {result.tips.map((tip, i) => (
                <Text key={i} style={[styles.tipItem, { color: c.textSecondary }]}>• {tip}</Text>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  header: { fontSize: 26, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 24 },
  label: {
    fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 8,
  },
  input: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, marginBottom: 20,
  },
  stepper: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    marginBottom: 20,
  },
  stepBtn: {
    borderWidth: 1.5, borderRadius: 10,
    padding: 8,
  },
  stepValue: { fontSize: 22, fontWeight: '800', minWidth: 32, textAlign: 'center' },
  pillScroll: { marginBottom: 20 },
  pill: {
    borderWidth: 1.5, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8, marginRight: 8,
  },
  pillActive: { borderColor: '#111', backgroundColor: '#111' },
  pillText: { fontSize: 14, fontWeight: '600' },
  pillTextActive: { color: '#fff' },
  generateBtn: {
    backgroundColor: '#111', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', marginBottom: 8,
  },
  generateBtnDisabled: { backgroundColor: '#999' },
  generateBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', marginVertical: 12 },
  loadingText: { fontSize: 13 },
  progressRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 20, marginBottom: 12,
  },
  progressText: { fontSize: 15, fontWeight: '700' },
  clearText: { fontSize: 13, fontWeight: '600' },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
  checkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderBottomWidth: 1, paddingVertical: 10,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  checkInfo: { flex: 1 },
  checkName: { fontSize: 14, fontWeight: '600' },
  checkNameDone: { textDecorationLine: 'line-through' },
  fromClosetBadge: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  tipsCard: {
    borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 4,
  },
  tipsTitle: { fontSize: 14, fontWeight: '800', marginBottom: 8 },
  tipItem: { fontSize: 13, lineHeight: 20 },
});
