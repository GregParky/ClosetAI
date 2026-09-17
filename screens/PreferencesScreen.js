import React, { useEffect, useState } from 'react';
import {
  View, Text, Switch, StyleSheet, Alert,
  ActivityIndicator, ScrollView, Pressable,
} from 'react-native';
import { getUserPreferences, saveUserPreferences } from '../firebase/firestoreService';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../context/ThemeContext';

const STYLES = [
  'Casual', 'Streetwear', 'Minimalist', 'Preppy',
  'Athleisure', 'Business', 'Formal',
];

const PreferencesScreen = ({ navigation }) => {
  const { user } = useAuth();
  const c = useColors();
  const [avoidDenimOnDenim, setAvoidDenimOnDenim] = useState(true);
  const [preferCasual, setPreferCasual] = useState(true);
  const [selectedStyles, setSelectedStyles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadPrefs = async () => {
      if (!user?.uid) { setLoading(false); return; }
      try {
        const prefs = await getUserPreferences(user.uid);
        if (prefs) {
          setAvoidDenimOnDenim(Boolean(prefs.avoidDenimOnDenim));
          setPreferCasual(Boolean(prefs.preferCasual));
          setSelectedStyles(Array.isArray(prefs.styles) ? prefs.styles : []);
        }
      } catch (err) {
        Alert.alert('Error loading preferences', err?.message || 'Please try again.');
      } finally {
        setLoading(false);
      }
    };
    loadPrefs();
  }, [user?.uid]);

  const toggleStyle = (s) => {
    setSelectedStyles((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const handleSave = async () => {
    if (!user?.uid) {
      Alert.alert('Not logged in', 'Please log in to save preferences.');
      return;
    }
    try {
      setSaving(true);
      await saveUserPreferences(user.uid, {
        avoidDenimOnDenim,
        preferCasual,
        styles: selectedStyles,
      });
      Alert.alert('Preferences saved!');
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error saving preferences', err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.header, { color: c.text }]}>Style Preferences</Text>

      <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Rules</Text>
      <View style={styles.option}>
        <View style={styles.optionText}>
          <Text style={[styles.optionTitle, { color: c.text }]}>Avoid denim on denim</Text>
          <Text style={[styles.optionDesc, { color: c.textMuted }]}>AI won't pair two denim items together</Text>
        </View>
        <Switch value={avoidDenimOnDenim} onValueChange={setAvoidDenimOnDenim} />
      </View>
      <View style={styles.option}>
        <View style={styles.optionText}>
          <Text style={[styles.optionTitle, { color: c.text }]}>Prefer casual outfits</Text>
          <Text style={[styles.optionDesc, { color: c.textMuted }]}>Prioritize relaxed, everyday looks</Text>
        </View>
        <Switch value={preferCasual} onValueChange={setPreferCasual} />
      </View>

      <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Your Aesthetic</Text>
      <Text style={[styles.sectionDesc, { color: c.textMuted }]}>
        The AI uses these to tailor outfit suggestions to your taste.
      </Text>
      <View style={styles.chipGrid}>
        {STYLES.map((s) => (
          <Pressable
            key={s}
            style={[
              styles.chip,
              { borderColor: c.borderStrong },
              selectedStyles.includes(s) && styles.chipActive,
            ]}
            onPress={() => toggleStyle(s)}
          >
            <Text style={[
              styles.chipText,
              { color: c.textSecondary },
              selectedStyles.includes(s) && styles.chipTextActive,
            ]}>
              {s}
            </Text>
          </Pressable>
        ))}
      </View>

      {saving ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <Pressable style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save Preferences</Text>
        </Pressable>
      )}
    </ScrollView>
  );
};

export default PreferencesScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: { fontSize: 22, fontWeight: '800', marginBottom: 24 },
  sectionLabel: {
    fontSize: 13, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
  },
  sectionDesc: { fontSize: 13, marginBottom: 12, marginTop: -6 },
  option: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  optionText: { flex: 1, marginRight: 12 },
  optionTitle: { fontSize: 15, fontWeight: '600' },
  optionDesc: { fontSize: 12, marginTop: 2 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 32 },
  chip: {
    borderWidth: 1.5, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 9,
  },
  chipActive: { borderColor: '#111', backgroundColor: '#111' },
  chipText: { fontSize: 14, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  saveBtn: {
    backgroundColor: '#111', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
