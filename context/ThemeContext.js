import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = '@theme_preference';

const ThemeContext = createContext(null);

export const LIGHT = {
  background: '#fff',
  surface: '#fafafa',
  surfaceAlt: '#f5f5f5',
  text: '#111',
  textSecondary: '#555',
  textMuted: '#888',
  border: '#ececec',
  borderStrong: '#ddd',
  tabBg: '#f2f2f2',
  tabActive: '#fff',
  inputBg: '#f9f9f9',
  placeholder: '#aaa',
  warningBg: '#fff4dd',
  warningBorder: '#ffe2a6',
  warningText: '#7a4f00',
};

export const DARK = {
  background: '#121212',
  surface: '#1e1e1e',
  surfaceAlt: '#2a2a2a',
  text: '#f0f0f0',
  textSecondary: '#aaa',
  textMuted: '#666',
  border: '#2e2e2e',
  borderStrong: '#444',
  tabBg: '#1e1e1e',
  tabActive: '#2a2a2a',
  inputBg: '#252525',
  placeholder: '#555',
  warningBg: '#2a1f00',
  warningBorder: '#5a3a00',
  warningText: '#f0c060',
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((saved) => {
      if (saved === 'dark' || saved === 'light') setTheme(saved);
    });
  }, []);

  const isDarkMode = theme === 'dark';

  const toggleTheme = async () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    await AsyncStorage.setItem(THEME_KEY, next);
  };

  return (
    <ThemeContext.Provider value={{ theme, isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

export function useColors() {
  const { isDarkMode } = useTheme();
  return isDarkMode ? DARK : LIGHT;
}

export default ThemeContext;
