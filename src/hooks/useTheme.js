import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'jet-theme';

function getSystemPreference() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getEffectiveTheme(preference) {
  if (preference === 'system') return getSystemPreference();
  return preference;
}

function applyTheme(theme) {
  const effective = getEffectiveTheme(theme);
  document.documentElement.classList.toggle('dark', effective === 'dark');
  // Update meta theme-color for mobile browsers
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', effective === 'dark' ? '#1C1C1E' : '#007AFF');
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored || 'system';
  });

  const setTheme = useCallback((newTheme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
    applyTheme(newTheme);
  }, []);

  // Apply on mount and listen for system preference changes
  useEffect(() => {
    applyTheme(theme);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const effectiveTheme = getEffectiveTheme(theme);
  const isDark = effectiveTheme === 'dark';

  const toggleTheme = useCallback(() => {
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
  }, [isDark, setTheme]);

  return { theme, effectiveTheme, isDark, setTheme, toggleTheme };
}
