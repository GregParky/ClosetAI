import React, { useEffect, useState } from 'react';
import { View, Text, Switch, Button, StyleSheet, Alert } from 'react-native';
import { getUserPreferences, saveUserPreferences } from '../firebase/firestoreService';
import { useTheme } from '../context/ThemeContext';

const PreferencesScreen = ({ navigation }) => {
  const { isDarkMode, toggleTheme } = useTheme();
  const [avoidDenimOnDenim, setAvoidDenimOnDenim] = useState(true);
  const [preferCasual, setPreferCasual] = useState(true);
  const userId = 'abc123'; // Replace with real auth user

  useEffect(() => {
    const loadPrefs = async () => {
      const prefs = await getUserPreferences(userId);
      if (prefs) {
        setAvoidDenimOnDenim(prefs.avoidDenimOnDenim);
        setPreferCasual(prefs.preferCasual);
      }
    };
    loadPrefs();
  }, []);

  const handleSavePreferences = async () => {
    try {
      await saveUserPreferences(userId, {
        avoidDenimOnDenim,
        preferCasual,
      });
      Alert.alert('Preferences saved!');
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error saving preferences:', err.message);
    }
  };

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
      <Button title="Save Preferences" onPress={handleSavePreferences} />
    </View>
  );
};

export default PreferencesScreen;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  option: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
});
