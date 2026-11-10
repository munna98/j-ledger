'use client';

import * as React from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentColor = 'emerald' | 'blue' | 'violet';

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  accent: AccentColor;
  setAccent: (accent: AccentColor) => void;
  resolvedTheme: 'light' | 'dark';
  toggleTheme: () => void;
}

const ThemeContext = React.createContext<ThemeContextType | undefined>(undefined);

const THEME_KEY = 'jledger_theme';
const ACCENT_KEY = 'jledger_accent';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<ThemeMode>('system');
  const [accent, setAccentState] = React.useState<AccentColor>('emerald');
  const [resolvedTheme, setResolvedTheme] = React.useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = React.useState(false);

  // Sync theme with DOM
  const applyTheme = React.useCallback(
    (currentTheme: ThemeMode, currentAccent: AccentColor) => {
      const root = document.documentElement;
      
      // Determine if dark
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = currentTheme === 'dark' || (currentTheme === 'system' && systemDark);
      
      if (isDark) {
        root.classList.add('dark');
        setResolvedTheme('dark');
      } else {
        root.classList.remove('dark');
        setResolvedTheme('light');
      }

      // Apply accent
      root.setAttribute('data-accent', currentAccent);
    },
    []
  );

  // Initialize from localStorage or defaults
  React.useEffect(() => {
    try {
      const storedTheme = (localStorage.getItem(THEME_KEY) as ThemeMode) || 'system';
      const storedAccent = (localStorage.getItem(ACCENT_KEY) as AccentColor) || 'emerald';
      
      setThemeState(storedTheme);
      setAccentState(storedAccent);
      applyTheme(storedTheme, storedAccent);
    } catch {
      applyTheme('system', 'emerald');
    }
    setMounted(true);
  }, [applyTheme]);

  // Listen for system theme changes when in 'system' mode
  React.useEffect(() => {
    if (!mounted) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system', accent);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, accent, mounted, applyTheme]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_KEY, newTheme);
    } catch {
      // Storage unavailable
    }
    applyTheme(newTheme, accent);
  };

  const setAccent = (newAccent: AccentColor) => {
    setAccentState(newAccent);
    try {
      localStorage.setItem(ACCENT_KEY, newAccent);
    } catch {
      // Storage unavailable
    }
    applyTheme(theme, newAccent);
  };

  const toggleTheme = () => {
    if (resolvedTheme === 'dark') {
      setTheme('light');
    } else {
      setTheme('dark');
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        accent,
        setAccent,
        resolvedTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
