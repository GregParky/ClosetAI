// navigation/MainTabs.js
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';

import ClosetScreen from '../screens/ClosetScreen';
import DiscoverScreen from '../screens/DiscoverScreen';
import OutfitScreen from '../screens/OutfitScreen';
import InboxScreen from '../screens/InboxScreen';
import SettingsScreen from '../screens/SettingsScreen';

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

          if (route.name === 'MyCloset') iconName = 'shirt-outline';
          if (route.name === 'Discover') iconName = 'search-outline';
          if (route.name === 'Outfit') iconName = 'sparkles-outline';
          if (route.name === 'Inbox') iconName = 'mail-outline';
          if (route.name === 'Settings') iconName = 'settings-outline';

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="MyCloset" component={ClosetScreen} options={{ title: 'My Closet' }} />
      <Tab.Screen name="Discover" component={DiscoverScreen} />
      <Tab.Screen name="Outfit" component={OutfitScreen} />
      <Tab.Screen name="Inbox" component={InboxScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
