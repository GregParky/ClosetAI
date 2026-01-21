// screens/HomeScreen.js
import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/firebaseConfig';
import { useTheme } from '../context/ThemeContext';

export default function HomeScreen({ navigation }) {
const { isDarkMode, toggleTheme } = useTheme();
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Error signing out:', err.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to ClosetAI 👗</Text>

      <Button title="Go to Closet" onPress={() => navigation.navigate('Closet')} />
      <Button title="Preferences" onPress={() => navigation.navigate('Preferences')} />
      <Button title="Generate Outfit" onPress={() => navigation.navigate('Outfit')} />
      <Button title="Settings" onPress={() => navigation.navigate('Settings')} />

      <View style={{ marginTop: 40 }}>
        <Button title="Logout" onPress={handleLogout} color="crimson" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
});
