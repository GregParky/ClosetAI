// context/ThemeContext.js
import React, { createContext, useContext, useState } from 'react';

// Create the actual context
const ThemeContext = createContext(null);

// Provider component
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light'); // or 'dark'

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const value = {
    theme,
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// ✅ Hook for consuming the theme
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}

// Default export in case anything imports ThemeContext directly
export default ThemeContext;
