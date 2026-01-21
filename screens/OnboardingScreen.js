// screens/OnboardingScreen.js
import React from 'react';
import { View, Text, Button } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function OnboardingScreen({ navigation }) {
  const { isDarkMode, toggleTheme } = useTheme();
  
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>🎉 Welcome to ClosetAI</Text>
      <Text>Let’s get you started with a few simple steps:</Text>
      <Text>1. Add at least 3 clothing items</Text>
      <Text>2. Set your style preferences</Text>
      <Text>3. Generate your first outfit</Text>
      <Button title="Start Now" onPress={() => navigation.replace('Closet')} />
    </View>
  );
}
