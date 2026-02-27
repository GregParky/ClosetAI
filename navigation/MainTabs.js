// navigation/MainTabs.js
import React from 'react';
import { View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import ClosetScreen from '../screens/ClosetScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

function Placeholder({ title }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 18 }}>{title}</Text>
    </View>
  );
}

export default function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: true, tabBarHideOnKeyboard: true }}>
      <Tab.Screen name="MyCloset" component={ClosetScreen} options={{ title: 'My Closet' }} />
      <Tab.Screen name="Discover" children={() => <Placeholder title="Discover" />} />
      <Tab.Screen name="Outfit" children={() => <Placeholder title="Outfit" />} />
      <Tab.Screen name="Inbox" children={() => <Placeholder title="Inbox" />} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
