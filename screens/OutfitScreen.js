// At the top
import { getWeather } from '../weatherService';
// OutfitScreen.js
import React, { useState } from 'react';
import { View, Text, Button, StyleSheet, Image } from 'react-native';
import { generateOutfit } from '../outfitGenerator';
import { useTheme } from '../context/ThemeContext';

export default function OutfitScreen() {
  const { isDarkMode, toggleTheme } = useTheme();
  
  const mockCloset = [
    { name: 'Blue Shirt', type: 'top' },
    { name: 'Black Jeans', type: 'bottom' },
    { name: 'White Sneakers', type: 'shoes' },
    { name: 'Denim Jacket', type: 'layer' }
  ];

  const preferences = { styleTags: ['casual'], avoidPairs: [['blue', 'black']] };
  const weather = { temperature: 65 };
  const [outfit, setOutfit] = useState(null);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Outfit</Text>
        <Button
        title="Generate Outfit"
        onPress={async () => {
            const weather = await getWeather();
            setOutfit(generateOutfit(mockCloset, preferences, weather));
        }}
        />
        {outfit && (
        <>
            <Text>Today's Temp: {weather.temperature}°F</Text>
            {/* rest of outfit UI */
                <View style={styles.outfitBox}>
                <Text>👕 {outfit.top.name}</Text>
                <Text>👖 {outfit.bottom.name}</Text>
                {outfit.layer && <Text>🧥 {outfit.layer.name}</Text>}
                <Text>👟 {outfit.shoes.name}</Text>
                </View>
            }
        </>
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  outfitBox: { marginTop: 20, alignItems: 'center' }
});
