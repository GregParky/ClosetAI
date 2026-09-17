import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, ActivityIndicator, Alert, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../context/ThemeContext';
import { saveBodyProfile, getBodyProfile } from '../firebase/firestoreService';
import { uploadImageToStorage } from '../firebase/uploadImageToStorage';

const BUILD_TYPES = [
  {
    key: 'slim',
    label: 'Slim',
    desc: 'Lean, narrow frame',
    image: require('../assets/silhouettes/slim.png'),
  },
  {
    key: 'athletic',
    label: 'Athletic',
    desc: 'Broad shoulders, defined waist',
    image: require('../assets/silhouettes/athletic.png'),
  },
  {
    key: 'average',
    label: 'Average',
    desc: 'Balanced, medium build',
    image: require('../assets/silhouettes/average.png'),
  },
  {
    key: 'curvy',
    label: 'Curvy',
    desc: 'Fuller hips and figure',
    image: require('../assets/silhouettes/curvy.png'),
  },
];

export default function BodyProfileScreen({ navigation }) {
  const { user } = useAuth();
  const c = useColors();
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [heightFt, setHeightFt]         = useState('');
  const [heightIn, setHeightIn]         = useState('');
  const [weightLbs, setWeightLbs]       = useState('');
  const [buildType, setBuildType]       = useState('average');
  const [modelPhotoUrl, setModelPhotoUrl] = useState(null);

  useEffect(() => {
    (async () => {
      const profile = await getBodyProfile(user.uid).catch(() => null);
      if (profile) {
        setHeightFt(String(profile.heightFt ?? ''));
        setHeightIn(String(profile.heightIn ?? ''));
        setWeightLbs(String(profile.weightLbs ?? ''));
        setBuildType(profile.buildType ?? 'average');
        setModelPhotoUrl(profile.modelPhotoUrl ?? null);
      }
      setLoading(false);
    })();
  }, [user.uid]);

  const handlePickModelPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission required', 'Allow photo access to upload your photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [2, 5],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    setUploadingPhoto(true);
    try {
      const url = await uploadImageToStorage(result.assets[0].uri, { userId: user.uid });
      setModelPhotoUrl(url);
      // Auto-save just the model photo so it's available immediately
      const existing = await getBodyProfile(user.uid).catch(() => ({})) || {};
      await saveBodyProfile(user.uid, { ...existing, modelPhotoUrl: url });
      Alert.alert('Photo saved', 'Your photo will be used for virtual try-on in the Compare screen.');
    } catch (err) {
      Alert.alert('Upload failed', err.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (!heightFt || !buildType) {
      Alert.alert('Missing info', 'Please enter at least your height and select a body type.');
      return;
    }
    setSaving(true);
    try {
      await saveBodyProfile(user.uid, {
        heightFt: parseInt(heightFt) || 0,
        heightIn: parseInt(heightIn) || 0,
        weightLbs: parseInt(weightLbs) || 0,
        buildType,
        modelPhotoUrl: modelPhotoUrl || null,
      });
      Alert.alert('Saved!', 'Your body profile has been updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <View style={[styles.center, { backgroundColor: c.background }]}><ActivityIndicator /></View>;
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.intro, { color: c.textMuted }]}>
        Your measurements help us show outfits on a figure that matches your proportions. Add a full-length photo of yourself to enable virtual try-on — see clothes actually on your body.
      </Text>

      {/* Your Photo */}
      <Text style={[styles.label, { color: c.textMuted }]}>Your Photo (for virtual try-on)</Text>
      <Pressable
        style={[styles.photoRow, { backgroundColor: c.surface, borderColor: c.border }]}
        onPress={handlePickModelPhoto}
        disabled={uploadingPhoto}
      >
        {modelPhotoUrl ? (
          <Image source={{ uri: modelPhotoUrl }} style={styles.modelThumb} resizeMode="cover" />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Ionicons name="person-add-outline" size={28} color={c.textMuted} />
          </View>
        )}
        <View style={styles.photoText}>
          <Text style={[styles.photoTitle, { color: c.text }]}>
            {modelPhotoUrl ? 'Change your photo' : 'Add a full-length photo'}
          </Text>
          <Text style={[styles.photoHint, { color: c.textMuted }]}>
            A head-to-toe photo gives the best try-on results
          </Text>
        </View>
        {uploadingPhoto
          ? <ActivityIndicator size="small" color={c.textMuted} />
          : <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
        }
      </Pressable>

      {/* Height */}
      <Text style={[styles.label, { color: c.textMuted }]}>Height</Text>
      <View style={styles.heightRow}>
        <View style={styles.heightField}>
          <TextInput
            style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.borderStrong, color: c.text }]}
            value={heightFt}
            onChangeText={setHeightFt}
            placeholder="5"
            placeholderTextColor={c.placeholder}
            keyboardType="number-pad"
            maxLength={1}
          />
          <Text style={[styles.unitLabel, { color: c.textMuted }]}>ft</Text>
        </View>
        <View style={styles.heightField}>
          <TextInput
            style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.borderStrong, color: c.text }]}
            value={heightIn}
            onChangeText={setHeightIn}
            placeholder="10"
            placeholderTextColor={c.placeholder}
            keyboardType="number-pad"
            maxLength={2}
          />
          <Text style={[styles.unitLabel, { color: c.textMuted }]}>in</Text>
        </View>
      </View>

      {/* Weight */}
      <Text style={[styles.label, { color: c.textMuted }]}>Weight (optional)</Text>
      <View style={styles.weightRow}>
        <TextInput
          style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.borderStrong, color: c.text, flex: 1 }]}
          value={weightLbs}
          onChangeText={setWeightLbs}
          placeholder="155"
          placeholderTextColor={c.placeholder}
          keyboardType="number-pad"
          maxLength={3}
        />
        <Text style={[styles.unitLabel, { color: c.textMuted }]}>lbs</Text>
      </View>

      {/* Build type */}
      <Text style={[styles.label, { color: c.textMuted }]}>Body Type</Text>
      <View style={styles.buildGrid}>
        {BUILD_TYPES.map((bt) => {
          const selected = buildType === bt.key;
          return (
            <Pressable
              key={bt.key}
              style={[styles.buildTile, { borderColor: selected ? '#111' : c.border, backgroundColor: selected ? c.surfaceAlt : 'transparent' }]}
              onPress={() => setBuildType(bt.key)}
            >
              <Image source={bt.image} style={styles.buildImg} resizeMode="contain" tintColor={selected ? '#111' : c.textMuted} />
              <Text style={[styles.buildLabel, { color: selected ? c.text : c.textSecondary }]}>{bt.label}</Text>
              <Text style={[styles.buildDesc,  { color: c.textMuted }]}>{bt.desc}</Text>
              {selected && <Ionicons name="checkmark-circle" size={18} color="#111" style={styles.buildCheck} />}
            </Pressable>
          );
        })}
      </View>

      {saving ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <Pressable style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save Body Profile</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  intro: { fontSize: 13, lineHeight: 20, marginBottom: 24 },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },

  photoRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14,
    padding: 12, marginBottom: 24, gap: 12,
  },
  photoPlaceholder: {
    width: 56, height: 56, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center', justifyContent: 'center',
  },
  modelThumb: { width: 56, height: 56, borderRadius: 10 },
  photoText: { flex: 1 },
  photoTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  photoHint: { fontSize: 12 },

  heightRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  heightField: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24, maxWidth: 160 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 18, fontWeight: '700', textAlign: 'center', width: 64 },
  unitLabel: { fontSize: 14, fontWeight: '600' },
  buildGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },
  buildTile: {
    width: '47%', borderWidth: 1.5, borderRadius: 14,
    padding: 12, alignItems: 'center', position: 'relative',
  },
  buildImg: { width: 60, height: 90, marginBottom: 8 },
  buildLabel: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  buildDesc: { fontSize: 11, textAlign: 'center' },
  buildCheck: { position: 'absolute', top: 8, right: 8 },
  saveBtn: { backgroundColor: '#111', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
