import React from 'react';
import { View, Text, Button, StyleSheet, Switch, Alert } from 'react-native';
import { auth } from '../firebase/firebaseConfig';
import { signOut } from 'firebase/auth';
import { useTheme } from '../context/ThemeContext'; // ✅ Import our ThemeContext

export default function SettingsScreen({ navigation }) {
  const user = auth.currentUser;
  const { isDarkMode, toggleTheme } = useTheme(); // ✅ Use global theme state

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      Alert.alert('Logout failed', err.message);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#121212' : '#fff' }]}>
      <Text style={[styles.header, { color: isDarkMode ? '#fff' : '#000' }]}>Settings</Text>

      <View style={styles.item}>
        <Text style={{ color: isDarkMode ? '#fff' : '#000' }}>Email:</Text>
        <Text style={[styles.value, { color: isDarkMode ? '#fff' : '#000' }]}>
          {user?.email || 'N/A'}
        </Text>
      </View>

      <View style={styles.item}>
        <Text style={{ color: isDarkMode ? '#fff' : '#000' }}>Dark Mode:</Text>
        <Switch value={isDarkMode} onValueChange={toggleTheme} />
      </View>

      <View style={{ marginTop: 40 }}>
        <Button title="Logout" onPress={handleLogout} color="crimson" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 50 },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 30 },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 15 },
  value: { fontWeight: '600' },
});
