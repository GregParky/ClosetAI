// screens/ClosetScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Button,
  Image,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { useAuth } from '../context/AuthContext';
import { uploadImageToStorage } from '../firebase/uploadImageToStorage';
import {
  addClothingItem,
  getUserCloset,
  deleteClothingItem,
} from '../firebase/firestoreService';

export default function ClosetScreen() {
  const { user } = useAuth();

  const [localImageUri, setLocalImageUri] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loadingCloset, setLoadingCloset] = useState(true);
  const [closetItems, setClosetItems] = useState([]);

  // Load closet items on mount / when user changes
  useEffect(() => {
    if (!user) return;
    loadCloset();
  }, [user]);

  const loadCloset = async () => {
    try {
      setLoadingCloset(true);
      const items = await getUserCloset(user.uid);
      setClosetItems(items);
    } catch (err) {
      console.error('Error loading closet:', err);
      Alert.alert('Error', 'Failed to load your closet items.');
    } finally {
      setLoadingCloset(false);
    }
  };

  const requestMediaPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission required',
        'We need access to your photo library to add clothing items.'
      );
      return false;
    }
    return true;
  };

  const pickImage = async () => {
    const hasPermission = await requestMediaPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled) {
      setLocalImageUri(result.assets[0].uri);
    }
  };

  const handleUploadClothingItem = async () => {
    if (!user) {
      Alert.alert('Not logged in', 'Please log in to add items to your closet.');
      return;
    }

    if (!localImageUri) {
      Alert.alert('No image selected', 'Please pick a clothing image first.');
      return;
    }

    try {
      setUploading(true);

      // 1. Upload image to Storage
      const imageUrl = await uploadImageToStorage(localImageUri, {
        folder: 'clothing',
        userId: user.uid,
      });

      // 2. Save clothing metadata to Firestore
      const newItem = {
        imageUrl,
        type: 'top',         // TODO: Replace with real user input
        color: 'unknown',    // TODO: Replace with real user input
      };

      const newDocId = await addClothingItem(user.uid, newItem);

      // 3. Update local state so UI refreshes immediately
      setClosetItems((prev) => [
        ...prev,
        { id: newDocId, ...newItem },
      ]);

      setLocalImageUri(null);
      Alert.alert('Success', 'Clothing item added to your closet!');
    } catch (err) {
      console.error('Error uploading clothing item:', err);
      Alert.alert('Error', 'Failed to upload clothing item.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteItem = (itemId) => {
    Alert.alert(
      'Delete item?',
      'Are you sure you want to remove this clothing item?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteClothingItem(itemId);
              setClosetItems((prev) => prev.filter((item) => item.id !== itemId));
            } catch (err) {
              console.error('Error deleting item:', err);
              Alert.alert('Error', 'Failed to delete item.');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.itemContainer}
      onLongPress={() => handleDeleteItem(item.id)}
    >
      <Image source={{ uri: item.imageUrl }} style={styles.itemImage} />
      {/* You can show type/color labels later */}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Closet</Text>

      <View style={styles.actionsRow}>
        <Button title="Pick Image" onPress={pickImage} />
        <View style={{ width: 12 }} />
        <Button
          title={uploading ? 'Uploading...' : 'Add to Closet'}
          onPress={handleUploadClothingItem}
          disabled={uploading}
        />
      </View>

      {localImageUri && (
        <View style={styles.previewContainer}>
          <Text style={styles.previewLabel}>Preview</Text>
          <Image source={{ uri: localImageUri }} style={styles.previewImage} />
        </View>
      )}

      <Text style={styles.sectionTitle}>Your Items</Text>

      {loadingCloset ? (
        <ActivityIndicator size="large" style={{ marginTop: 20 }} />
      ) : closetItems.length === 0 ? (
        <Text style={styles.emptyText}>
          No items yet. Add your first piece!
        </Text>
      ) : (
        <FlatList
          data={closetItems}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={styles.grid}
          renderItem={renderItem}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingTop: 32,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  previewContainer: {
    marginTop: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  previewLabel: {
    fontSize: 14,
    marginBottom: 4,
    fontWeight: '600',
  },
  previewImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 8,
  },
  emptyText: {
    marginTop: 12,
    color: '#666',
  },
  grid: {
    paddingTop: 8,
  },
  itemContainer: {
    flex: 1 / 3,
    aspectRatio: 1,
    margin: 4,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f1f1f1',
  },
  itemImage: {
    width: '100%',
    height: '100%',
  },
});
