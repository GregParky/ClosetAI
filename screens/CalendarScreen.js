import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList,
  Modal, Image, ActivityIndicator, ScrollView, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../context/ThemeContext';
import {
  getSavedOutfits, getOutfitPlans, setOutfitPlan, removeOutfitPlan,
} from '../firebase/firestoreService';
import { getWeatherForecast, getWeatherForecastForCity } from '../weatherService';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getWeekDates(offset = 0) {
  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isToday(date) {
  const t = new Date();
  return (
    date.getDate() === t.getDate() &&
    date.getMonth() === t.getMonth() &&
    date.getFullYear() === t.getFullYear()
  );
}

function LocationModal({ visible, onConfirm, onClear, onClose, hasOverride, colors: c }) {
  const [city, setCity] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setCity('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={[styles.modalCard, { backgroundColor: c.background }]} onPress={() => {}}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Set Travel Location</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={c.textMuted} />
            </Pressable>
          </View>

          <Text style={[styles.locationHint, { color: c.textMuted }]}>
            Enter a city to see its weather forecast on your calendar instead of your current location.
          </Text>

          <TextInput
            ref={inputRef}
            style={[styles.cityInput, { backgroundColor: c.inputBg, borderColor: c.borderStrong, color: c.text }]}
            placeholder="e.g. Tokyo, London, New York"
            placeholderTextColor={c.placeholder}
            value={city}
            onChangeText={setCity}
            returnKeyType="done"
            onSubmitEditing={() => city.trim() && onConfirm(city.trim())}
            autoCapitalize="words"
          />

          <Pressable
            style={[styles.confirmBtn, !city.trim() && styles.confirmBtnDisabled]}
            onPress={() => city.trim() && onConfirm(city.trim())}
            disabled={!city.trim()}
          >
            <Ionicons name="location" size={16} color="#fff" />
            <Text style={styles.confirmBtnText}>Use This Location</Text>
          </Pressable>

          {hasOverride && (
            <Pressable style={[styles.clearBtn, { borderColor: c.borderStrong }]} onPress={onClear}>
              <Ionicons name="navigate-outline" size={15} color={c.textSecondary} />
              <Text style={[styles.clearBtnText, { color: c.textSecondary }]}>Reset to My Location</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function OutfitPickerModal({ visible, savedOutfits, onPick, onClose, colors: c }) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: c.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Pick an outfit</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={c.textMuted} />
            </Pressable>
          </View>
          {savedOutfits.length === 0 ? (
            <Text style={[styles.emptyPicker, { color: c.textMuted }]}>
              Save an outfit on the Outfit tab first.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 400 }}>
              {savedOutfits.map((outfit) => {
                const thumbItems = [outfit.top, outfit.bottom, outfit.onePiece, outfit.layer, outfit.shoes]
                  .filter(Boolean).slice(0, 3);
                return (
                  <Pressable
                    key={outfit.id}
                    style={[styles.pickerRow, { borderColor: c.border }]}
                    onPress={() => onPick(outfit)}
                  >
                    <View style={styles.pickerThumbs}>
                      {thumbItems.map((item, i) =>
                        item?.imageUrl ? (
                          <Image key={i} source={{ uri: item.imageUrl }} style={styles.pickerThumb} />
                        ) : (
                          <View key={i} style={[styles.pickerThumb, { backgroundColor: c.surfaceAlt }]} />
                        )
                      )}
                    </View>
                    <Text style={[styles.pickerName, { color: c.text }]} numberOfLines={1}>
                      {outfit.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default function CalendarScreen() {
  const { user } = useAuth();
  const c = useColors();
  const [weekOffset, setWeekOffset] = useState(0);
  const [plans, setPlans] = useState({});
  const [savedOutfits, setSavedOutfits] = useState([]);
  const [forecast, setForecast] = useState({});
  const [forecastLoading, setForecastLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pickerDay, setPickerDay] = useState(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationOverride, setLocationOverride] = useState(null); // null = GPS

  const weekDates = getWeekDates(weekOffset);
  const startKey = toDateKey(weekDates[0]);
  const endKey = toDateKey(weekDates[6]);

  const loadForecast = useCallback(async (cityOverride) => {
    setForecastLoading(true);
    try {
      const fc = cityOverride
        ? await getWeatherForecastForCity(cityOverride)
        : await getWeatherForecast();
      setForecast(fc || {});
    } catch {
      setForecast({});
    } finally {
      setForecastLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    const [planDocs, saved] = await Promise.all([
      getOutfitPlans(user.uid, startKey, endKey),
      getSavedOutfits(user.uid),
    ]);
    const planMap = {};
    for (const p of planDocs) planMap[p.date] = p;
    setPlans(planMap);
    setSavedOutfits(Array.isArray(saved) ? saved : []);
    setLoading(false);
  }, [user?.uid, startKey, endKey]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load forecast once on mount (or when location override changes)
  useEffect(() => { loadForecast(locationOverride); }, [locationOverride]);

  const handleConfirmLocation = useCallback(async (city) => {
    setShowLocationModal(false);
    try {
      setForecastLoading(true);
      const fc = await getWeatherForecastForCity(city);
      setForecast(fc || {});
      setLocationOverride(city);
    } catch {
      Alert.alert('City not found', `Could not find weather for "${city}". Check the spelling and try again.`);
    } finally {
      setForecastLoading(false);
    }
  }, []);

  const handleClearLocation = useCallback(() => {
    setShowLocationModal(false);
    setLocationOverride(null);
  }, []);

  const handlePick = useCallback(async (outfit) => {
    if (!pickerDay || !user?.uid) return;
    setPickerDay(null);
    const optimistic = {
      date: pickerDay,
      outfitId: outfit.id,
      name: outfit.name,
      description: outfit.description,
      top: outfit.top,
      bottom: outfit.bottom,
      onePiece: outfit.onePiece,
      layer: outfit.layer,
      shoes: outfit.shoes,
    };
    setPlans((prev) => ({ ...prev, [pickerDay]: optimistic }));
    await setOutfitPlan(user.uid, pickerDay, outfit);
  }, [pickerDay, user?.uid]);

  const handleRemove = useCallback(async (dateKey) => {
    if (!user?.uid) return;
    setPlans((prev) => {
      const next = { ...prev };
      delete next[dateKey];
      return next;
    });
    await removeOutfitPlan(user.uid, dateKey);
  }, [user?.uid]);

  const monthLabel = (() => {
    const first = weekDates[0];
    const last = weekDates[6];
    if (first.getMonth() === last.getMonth()) {
      return `${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`;
    }
    return `${MONTH_NAMES[first.getMonth()]} – ${MONTH_NAMES[last.getMonth()]} ${last.getFullYear()}`;
  })();

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Week nav */}
      <View style={styles.weekNav}>
        <Pressable onPress={() => setWeekOffset((o) => o - 1)} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={c.text} />
        </Pressable>
        <Text style={[styles.monthLabel, { color: c.text }]}>{monthLabel}</Text>
        <Pressable onPress={() => setWeekOffset((o) => o + 1)} hitSlop={12}>
          <Ionicons name="chevron-forward" size={22} color={c.text} />
        </Pressable>
      </View>

      {/* Location bar */}
      <Pressable
        style={[styles.locationBar, { backgroundColor: c.surfaceAlt, borderColor: locationOverride ? '#111' : c.border }]}
        onPress={() => setShowLocationModal(true)}
      >
        <Ionicons
          name={locationOverride ? 'location' : 'location-outline'}
          size={14}
          color={locationOverride ? '#fff' : c.textSecondary}
          style={locationOverride ? styles.locationIconActive : null}
        />
        <Text style={[styles.locationLabel, { color: locationOverride ? c.text : c.textSecondary }]}>
          {locationOverride ?? 'My Location'}
        </Text>
        {forecastLoading && <ActivityIndicator size="small" style={{ marginLeft: 6 }} />}
        {locationOverride && (
          <Pressable
            hitSlop={8}
            onPress={handleClearLocation}
            style={styles.clearX}
          >
            <Ionicons name="close-circle" size={15} color={c.textMuted} />
          </Pressable>
        )}
        {!locationOverride && (
          <Ionicons name="chevron-down" size={13} color={c.textMuted} style={{ marginLeft: 2 }} />
        )}
      </Pressable>

      {weekOffset !== 0 && (
        <Pressable style={styles.todayBtn} onPress={() => setWeekOffset(0)}>
          <Text style={[styles.todayBtnText, { color: c.textSecondary }]}>Back to this week</Text>
        </Pressable>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={weekDates}
          keyExtractor={(item) => toDateKey(item)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item: date }) => {
            const key = toDateKey(date);
            const plan = plans[key];
            const today = isToday(date);
            const wx = forecast[key];
            const thumbItems = plan
              ? [plan.top, plan.bottom, plan.onePiece, plan.layer, plan.shoes].filter(Boolean).slice(0, 3)
              : [];

            return (
              <View style={[styles.dayRow, { borderColor: c.border, backgroundColor: c.surface }]}>
                {/* Day label */}
                <View style={[styles.dayLabel, today && { backgroundColor: '#111' }]}>
                  <Text style={[styles.dayName, { color: today ? '#fff' : c.textMuted }]}>
                    {DAY_LABELS[date.getDay() === 0 ? 6 : date.getDay() - 1]}
                  </Text>
                  <Text style={[styles.dayNum, { color: today ? '#fff' : c.text }]}>
                    {date.getDate()}
                  </Text>
                </View>

                {/* Weather badge */}
                {wx ? (
                  <View style={styles.wxBadge}>
                    <Text style={styles.wxEmoji}>{wx.emoji}</Text>
                    <Text style={[styles.wxTemp, { color: c.textMuted }]}>{wx.temp}°</Text>
                  </View>
                ) : (
                  <View style={styles.wxBadgePlaceholder} />
                )}

                {/* Outfit slot */}
                {plan ? (
                  <Pressable
                    style={styles.planSlot}
                    onLongPress={() => handleRemove(key)}
                    onPress={() => setPickerDay(key)}
                  >
                    <View style={styles.planThumbs}>
                      {thumbItems.map((item, i) =>
                        item?.imageUrl ? (
                          <Image key={i} source={{ uri: item.imageUrl }} style={styles.planThumb} />
                        ) : (
                          <View key={i} style={[styles.planThumb, { backgroundColor: c.surfaceAlt }]} />
                        )
                      )}
                    </View>
                    <View style={styles.planInfo}>
                      <Text style={[styles.planName, { color: c.text }]} numberOfLines={1}>{plan.name}</Text>
                      <Text style={[styles.planHint, { color: c.textMuted }]}>Hold to remove</Text>
                    </View>
                  </Pressable>
                ) : (
                  <Pressable style={styles.addSlot} onPress={() => setPickerDay(key)}>
                    <Ionicons name="add-circle-outline" size={22} color={c.textMuted} />
                    <Text style={[styles.addSlotText, { color: c.textMuted }]}>Add outfit</Text>
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      )}

      <OutfitPickerModal
        visible={!!pickerDay}
        savedOutfits={savedOutfits}
        onPick={handlePick}
        onClose={() => setPickerDay(null)}
        colors={c}
      />

      <LocationModal
        visible={showLocationModal}
        onConfirm={handleConfirmLocation}
        onClear={handleClearLocation}
        onClose={() => setShowLocationModal(false)}
        hasOverride={!!locationOverride}
        colors={c}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  monthLabel: { fontSize: 17, fontWeight: '800' },
  locationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
  },
  locationIconActive: {
    backgroundColor: '#111',
    borderRadius: 10,
    overflow: 'hidden',
  },
  locationLabel: { fontSize: 13, fontWeight: '600' },
  clearX: { marginLeft: 2 },
  todayBtn: { alignItems: 'center', paddingBottom: 4 },
  todayBtnText: { fontSize: 13, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    gap: 10,
  },
  dayLabel: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minWidth: 46,
  },
  dayName: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  dayNum: { fontSize: 20, fontWeight: '800', marginTop: 2 },
  wxBadge: { alignItems: 'center', minWidth: 34 },
  wxBadgePlaceholder: { minWidth: 34 },
  wxEmoji: { fontSize: 17, lineHeight: 20 },
  wxTemp: { fontSize: 11, fontWeight: '700', marginTop: 1 },
  planSlot: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  planThumbs: { flexDirection: 'row', gap: 4 },
  planThumb: { width: 40, height: 40, borderRadius: 8 },
  planInfo: { flex: 1 },
  planName: { fontSize: 14, fontWeight: '700' },
  planHint: { fontSize: 11, marginTop: 2 },
  addSlot: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  addSlotText: { fontSize: 14, fontWeight: '600' },
  // Modals
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  locationHint: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  cityInput: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, marginBottom: 14,
  },
  confirmBtn: {
    backgroundColor: '#111', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    marginBottom: 10,
  },
  confirmBtnDisabled: { backgroundColor: '#999' },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  clearBtn: {
    borderWidth: 1, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 8,
  },
  clearBtnText: { fontSize: 14, fontWeight: '600' },
  emptyPicker: { textAlign: 'center', paddingVertical: 32, fontSize: 14 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderBottomWidth: 1, paddingVertical: 10,
  },
  pickerThumbs: { flexDirection: 'row', gap: 4 },
  pickerThumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#eee' },
  pickerName: { flex: 1, fontSize: 14, fontWeight: '600' },
});
