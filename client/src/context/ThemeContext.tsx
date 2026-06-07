import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { ReactNode, Dispatch, SetStateAction } from 'react';

type Theme = 'light' | 'dark';

function usePrevious(theme: Theme): Theme | undefined {
  const ref = useRef<Theme | undefined>(undefined);
  useEffect(() => {
    ref.current = theme;
  });
  return ref.current;
}

function useStorageTheme(key: string): [Theme, Dispatch<SetStateAction<Theme>>] {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const stored = localStorage.getItem(key) as Theme | null;
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored);
      return;
    }
    const prefersDark =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'dark' : 'light');
  }, [key]);

  useEffect(() => {
    localStorage.setItem(key, theme);
  }, [theme, key]);

  return [theme, setTheme];
}

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
};

export const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

type ThemeProviderProps = {
  children: ReactNode;
};

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setTheme] = useStorageTheme('theme');

  const oldTheme = usePrevious(theme);
  useEffect(() => {
    if (oldTheme) {
      document.documentElement.classList.remove(`theme-${oldTheme}`);
    }
    document.documentElement.classList.add(`theme-${theme}`);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme, oldTheme]);

  function toggleTheme(): void {
    setTheme((prev: Theme): Theme => (prev === 'light' ? 'dark' : 'light'));
  }

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      toggleTheme,
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
