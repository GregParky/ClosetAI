import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, Alert, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../firebase/firebaseConfig';
import { signOut } from 'firebase/auth';
import { useTheme, useColors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { reprocessClosetPhotos } from '../services/closetReprocessService';

export default function SettingsScreen({ navigation }) {
  const { user } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const c = useColors();
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessLabel, setReprocessLabel] = useState('');

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      Alert.alert('Logout failed', err.message);
    }
  };

  const handleReprocessCloset = async () => {
    if (reprocessing) return;
    setReprocessing(true);
    try {
      const result = await reprocessClosetPhotos(user.uid, (done, total, label) => {
        setReprocessLabel(`${done}/${total} — ${label}`);
      });
      Alert.alert(
        'Reprocess complete',
        `Checked ${result.total} items.\nUpdated: ${result.updated}\nFailed: ${result.failed}\nSaved outfits synced: ${result.outfitsUpdated}`
      );
    } catch (err) {
      Alert.alert('Reprocess failed', err.message);
    } finally {
      setReprocessing(false);
      setReprocessLabel('');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Text style={[styles.header, { color: c.text }]}>Settings</Text>

      <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.row}>
          <Text style={[styles.label, { color: c.text }]}>Email</Text>
          <Text style={[styles.value, { color: c.textSecondary }]}>{user?.email || 'N/A'}</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <View style={styles.row}>
          <Text style={[styles.label, { color: c.text }]}>Dark Mode</Text>
          <Switch value={isDarkMode} onValueChange={toggleTheme} />
        </View>
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <Pressable style={styles.row} onPress={() => navigation.navigate('BodyProfile')}>
          <Text style={[styles.label, { color: c.text }]}>Body Profile</Text>
          <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
        </Pressable>
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <Pressable style={styles.row} onPress={handleReprocessCloset} disabled={reprocessing}>
          <Text style={[styles.label, { color: c.text }]}>Reprocess Closet Photos</Text>
          {reprocessing ? <ActivityIndicator size="small" /> : <Ionicons name="chevron-forward" size={16} color={c.textMuted} />}
        </Pressable>
        {reprocessing && (
          <Text style={[styles.value, { color: c.textSecondary, paddingHorizontal: 16, paddingBottom: 12 }]}>
            {reprocessLabel}
          </Text>
        )}
      </View>

      <Pressable style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 32 },
  header: { fontSize: 26, fontWeight: '800', marginBottom: 24 },
  section: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', marginBottom: 24 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  divider: { height: 1, marginHorizontal: 16 },
  label: { fontSize: 15, fontWeight: '600' },
  value: { fontSize: 14 },
  logoutBtn: { alignItems: 'center', paddingVertical: 12 },
  logoutText: { fontSize: 15, color: '#e0374a', fontWeight: '700' },
});
