import React, { useEffect, useState } from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from './context/AuthContext';
import { useTheme } from './context/ThemeContext';
import AuthScreen from './screens/AuthScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import PreferencesScreen from './screens/PreferencesScreen';
import SettingsScreen from './screens/SettingsScreen';
import InboxScreen from './screens/InboxScreen';
import OtherProfileScreen from './screens/OtherProfileScreen';
import SearchUsersScreen from './screens/SearchUsersScreen';
import OutfitCompareScreen from './screens/OutfitCompareScreen';
import OutfitRatingsScreen from './screens/OutfitRatingsScreen';
import BodyProfileScreen from './screens/BodyProfileScreen';
import CollectionDetailScreen from './screens/CollectionDetailScreen';
import FollowListScreen from './screens/FollowListScreen';
import WebSearchScreen from './screens/WebSearchScreen';
import OutfitScanScreen from './screens/OutfitScanScreen';
import MainTabs from './navigation/MainTabs';

const Stack = createNativeStackNavigator();

export default function Navigation() {
  const { user, initializing } = useAuth();
  const { isDarkMode } = useTheme();
  const [hasOnboarded, setHasOnboarded] = useState(null);

  useEffect(() => {
    if (!user?.uid) {
      setHasOnboarded(null);
      return;
    }
    AsyncStorage.getItem(`@onboarded_${user.uid}`).then((val) => {
      setHasOnboarded(!!val);
    });
  }, [user?.uid]);

  if (initializing || (user && hasOnboarded === null)) return null;

  return (
    <NavigationContainer theme={isDarkMode ? DarkTheme : DefaultTheme}>
      <Stack.Navigator initialRouteName={user ? (hasOnboarded ? 'MainTabs' : 'Onboarding') : 'Auth'}>
        {user ? (
          <>
            <Stack.Screen
              name="Onboarding"
              component={OnboardingScreen}
              options={{ headerShown: false, gestureEnabled: false }}
            />
            <Stack.Screen
              name="MainTabs"
              component={MainTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Preferences"
              component={PreferencesScreen}
              options={{ title: 'Preferences' }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ title: 'Settings' }}
            />
            <Stack.Screen
              name="Activity"
              component={InboxScreen}
              options={{ title: 'Activity & Stats' }}
            />
            <Stack.Screen
              name="OtherProfile"
              component={OtherProfileScreen}
              options={{ title: 'Profile' }}
            />
            <Stack.Screen
              name="SearchUsers"
              component={SearchUsersScreen}
              options={{ title: 'Find People' }}
            />
            <Stack.Screen
              name="OutfitCompare"
              component={OutfitCompareScreen}
              options={{ title: 'Compare Outfits' }}
            />
            <Stack.Screen
              name="OutfitRatings"
              component={OutfitRatingsScreen}
              options={{ title: 'My Outfit Rankings' }}
            />
            <Stack.Screen
              name="BodyProfile"
              component={BodyProfileScreen}
              options={{ title: 'Body Profile' }}
            />
            <Stack.Screen
              name="CollectionDetail"
              component={CollectionDetailScreen}
              options={({ route }) => ({ title: route.params?.collection?.name || 'Collection' })}
            />
            <Stack.Screen
              name="WebSearch"
              component={WebSearchScreen}
              options={{ title: 'Search for Item' }}
            />
            <Stack.Screen
              name="OutfitScan"
              component={OutfitScanScreen}
              options={{ title: 'Scan Outfit', headerBackTitle: 'My Closet' }}
            />
            <Stack.Screen
              name="FollowList"
              component={FollowListScreen}
              options={({ route }) => ({
                title: route.params?.type === 'followers' ? 'Followers' : 'Following',
              })}
            />
          </>
        ) : (
          <Stack.Screen
            name="Auth"
            component={AuthScreen}
            options={{ headerShown: false }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
