import React, { useEffect, useState } from 'react';
import { View, Text, Switch, Button, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { getUserPreferences, saveUserPreferences } from '../firebase/firestoreService';
import { useAuth } from '../context/AuthContext';

const PreferencesScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [avoidDenimOnDenim, setAvoidDenimOnDenim] = useState(true);
  const [preferCasual, setPreferCasual] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const userId = user?.uid;

  useEffect(() => {
    const loadPrefs = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }
      try {
        const prefs = await getUserPreferences(userId);
        if (prefs) {
          setAvoidDenimOnDenim(Boolean(prefs.avoidDenimOnDenim));
          setPreferCasual(Boolean(prefs.preferCasual));
        }
      } catch (err) {
        Alert.alert('Error loading preferences', err?.message || 'Please try again.');
      } finally {
        setLoading(false);
      }
    };
    loadPrefs();
  }, [userId]);

  const handleSavePreferences = async () => {
    if (!userId) {
      Alert.alert('Not logged in', 'Please log in to save preferences.');
      return;
    }
    try {
      setSaving(true);
      await saveUserPreferences(userId, {
        avoidDenimOnDenim,
        preferCasual,
      });
      Alert.alert('Preferences saved!');
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error saving preferences:', err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Style Preferences</Text>
      <View style={styles.option}>
        <Text>Avoid denim on denim</Text>
        <Switch value={avoidDenimOnDenim} onValueChange={setAvoidDenimOnDenim} />
      </View>
      <View style={styles.option}>
        <Text>Prefer casual outfits</Text>
        <Switch value={preferCasual} onValueChange={setPreferCasual} />
      </View>
      {saving ? (
        <ActivityIndicator />
      ) : (
        <Button title="Save Preferences" onPress={handleSavePreferences} />
      )}
    </View>
  );
};

export default PreferencesScreen;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  option: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
});
