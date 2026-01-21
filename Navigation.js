// Navigation.js
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from './context/AuthContext';
import AuthScreen from './screens/AuthScreen';
import ClosetScreen from './screens/ClosetScreen';
import PreferencesScreen from './screens/PreferencesScreen';

const Stack = createStackNavigator();

export default function Navigation() {
  // ✅ useAuth() (and thus useContext) is called INSIDE a component
  const { user, initializing } = useAuth();

  if (initializing) {
    // You can render a splash or loading screen here
    return null;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {user ? (
          <>
            <Stack.Screen
              name="Closet"
              component={ClosetScreen}
              options={{ title: 'My Closet' }}
            />
            <Stack.Screen
              name="Preferences"
              component={PreferencesScreen}
              options={{ title: 'Preferences' }}
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
