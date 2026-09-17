import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../context/ThemeContext';
import { getSavedOutfits } from '../firebase/firestoreService';
import { getWeather } from '../weatherService';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const c = useColors();
  const [weather, setWeather] = useState(null);
  const [outfitOfDay, setOutfitOfDay] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    async function load() {
      const [weatherResult, savedResult] = await Promise.allSettled([
        getWeather(),
        getSavedOutfits(user.uid),
      ]);
      if (weatherResult.status === 'fulfilled') setWeather(weatherResult.value);
      if (savedResult.status === 'fulfilled' && savedResult.value?.length > 0) {
        setOutfitOfDay(savedResult.value[0]);
      }
      setLoading(false);
    }
    load();
  }, [user?.uid]);

  const firstName = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || '';
  const outfitItems = outfitOfDay
    ? [outfitOfDay.top, outfitOfDay.bottom, outfitOfDay.onePiece, outfitOfDay.layer, outfitOfDay.shoes]
        .filter(Boolean)
        .slice(0, 4)
    : [];

  return (
    <View style={[styles.wrapper, { backgroundColor: c.background }]}>
      {/* Custom header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Text style={[styles.appName, { color: c.text }]}>ClosetAI</Text>
        <View style={styles.headerIcons}>
          <Pressable onPress={() => navigation.navigate('SearchUsers')} hitSlop={10}>
            <Ionicons name="person-add-outline" size={22} color={c.textSecondary} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={10}>
            <Ionicons name="settings-outline" size={22} color={c.textSecondary} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.greeting, { color: c.text }]}>
          {getGreeting()}{firstName ? `, ${firstName}` : ''}!
        </Text>

        {/* Weather card */}
        {loading ? (
          <View style={[styles.weatherCard, { backgroundColor: c.surfaceAlt }]}>
            <ActivityIndicator size="small" color={c.textSecondary} />
            <Text style={[styles.weatherDesc, { color: c.textSecondary }]}>  Getting weather...</Text>
          </View>
        ) : weather ? (
          <View style={[styles.weatherCard, { backgroundColor: c.surfaceAlt }]}>
            <Text style={styles.weatherEmoji}>{weather.emoji}</Text>
            <View style={styles.weatherInfo}>
              <Text style={[styles.weatherTemp, { color: c.text }]}>{Math.round(weather.temperature)}°F</Text>
              <Text style={[styles.weatherDesc, { color: c.textSecondary }]}>{weather.description}</Text>
              {weather.city ? <Text style={[styles.weatherCity, { color: c.textMuted }]}>{weather.city}</Text> : null}
            </View>
          </View>
        ) : null}

        {/* Outfit of the day */}
        <Text style={[styles.sectionTitle, { color: c.text }]}>Outfit of the Day</Text>
        {loading ? (
          <View style={[styles.outfitCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <ActivityIndicator size="small" color={c.textMuted} />
          </View>
        ) : outfitOfDay ? (
          <Pressable
            style={[styles.outfitCard, { backgroundColor: c.surface, borderColor: c.border }]}
            onPress={() => navigation.navigate('Outfit')}
          >
            <Text style={[styles.outfitName, { color: c.text }]}>{outfitOfDay.name}</Text>
            {outfitOfDay.description ? (
              <Text style={[styles.outfitDesc, { color: c.textSecondary }]}>{outfitOfDay.description}</Text>
            ) : null}
            <View style={styles.thumbRow}>
              {outfitItems.map((item, i) =>
                item?.imageUrl ? (
                  <Image key={i} source={{ uri: item.imageUrl }} style={styles.miniThumb} />
                ) : (
                  <View key={i} style={[styles.miniThumb, { backgroundColor: c.surfaceAlt }]} />
                )
              )}
            </View>
            <Text style={[styles.outfitCta, { color: c.text }]}>See more outfits →</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.outfitCardEmpty, { borderColor: c.borderStrong }]}
            onPress={() => navigation.navigate('Outfit')}
          >
            <Text style={[styles.outfitEmptyTitle, { color: c.textSecondary }]}>No saved outfits yet</Text>
            <Text style={[styles.outfitEmptyDesc, { color: c.textMuted }]}>
              Generate and save your first outfit to see it here.
            </Text>
            <Text style={[styles.outfitCta, { color: c.text }]}>Generate now →</Text>
          </Pressable>
        )}

        {/* Quick actions */}
        <Text style={[styles.sectionTitle, { color: c.text }]}>Quick Actions</Text>
        <View style={styles.actionGrid}>
          <Pressable
            style={[styles.actionBtn, { borderColor: c.borderStrong }]}
            onPress={() => navigation.navigate('MyCloset')}
          >
            <Ionicons name="shirt-outline" size={22} color={c.text} />
            <Text style={[styles.actionBtnText, { color: c.text }]}>My Closet</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.actionBtnPrimary]}
            onPress={() => navigation.navigate('Outfit')}
          >
            <Ionicons name="sparkles-outline" size={22} color="#fff" />
            <Text style={[styles.actionBtnText, { color: '#fff' }]}>Generate Outfit</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { borderColor: c.borderStrong }]}
            onPress={() => navigation.navigate('Calendar')}
          >
            <Ionicons name="calendar-outline" size={22} color={c.text} />
            <Text style={[styles.actionBtnText, { color: c.text }]}>Plan Week</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  appName: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  content: { padding: 20, paddingBottom: 40 },

  greeting: { fontSize: 24, fontWeight: '800', marginBottom: 16 },

  weatherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  weatherEmoji: { fontSize: 36, marginRight: 14 },
  weatherInfo: { flex: 1 },
  weatherTemp: { fontSize: 26, fontWeight: '800' },
  weatherDesc: { fontSize: 14, marginTop: 2 },
  weatherCity: { fontSize: 12, marginTop: 2 },

  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 10 },

  outfitCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  outfitName: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  outfitDesc: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  thumbRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  miniThumb: { width: 56, height: 56, borderRadius: 10 },
  outfitCta: { fontSize: 13, fontWeight: '700' },

  outfitCardEmpty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  outfitEmptyTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  outfitEmptyDesc: { fontSize: 13, textAlign: 'center', marginBottom: 10 },

  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionBtn: {
    width: '47.5%',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 8,
  },
  actionBtnPrimary: { backgroundColor: '#111', borderColor: '#111' },
  actionBtnText: { fontSize: 13, fontWeight: '700' },
});
