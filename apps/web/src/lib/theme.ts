// Theme preference: 'system' follows the OS (prefers-color-scheme in
// styles.css), 'light'/'dark' is an explicit override persisted across
// sessions. Applied via a `data-theme` attribute on <html> — see the
// blocking inline script in index.html for the pre-paint application that
// avoids a flash of the wrong theme on load; this module keeps that in
// sync with whatever the user picks afterwards.

import { useEffect, useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'lazysentry-theme';

export function getStoredTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    // Storage can throw in a locked-down environment — fall back quietly.
  }
  return 'system';
}

function applyTheme(theme: Theme): void {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore — the in-memory state still drives this session correctly,
      // it just won't be remembered next time.
    }
  }, [theme]);

  return [theme, setTheme];
}
