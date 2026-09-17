import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';

import HomeScreen from '../screens/HomeScreen';
import ClosetScreen from '../screens/ClosetScreen';
import DiscoverScreen from '../screens/DiscoverScreen';
import OutfitScreen from '../screens/OutfitScreen';
import CalendarScreen from '../screens/CalendarScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: '#111',
        tabBarInactiveTintColor: '#8a8a8a',
        tabBarIcon: ({ color, size }) => {
          let iconName = 'ellipse-outline';

          if (route.name === 'Home') iconName = 'home-outline';
          if (route.name === 'MyCloset') iconName = 'shirt-outline';
          if (route.name === 'Discover') iconName = 'search-outline';
          if (route.name === 'Outfit') iconName = 'sparkles-outline';
          if (route.name === 'Calendar') iconName = 'calendar-outline';
          if (route.name === 'Profile') iconName = 'person-circle-outline';

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Tab.Screen name="MyCloset" component={ClosetScreen} options={{ title: 'My Closet' }} />
      <Tab.Screen name="Discover" component={DiscoverScreen} />
      <Tab.Screen name="Outfit" component={OutfitScreen} />
      <Tab.Screen name="Calendar" component={CalendarScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}
