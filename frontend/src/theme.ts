export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'seo-dashboard-theme';

const isThemePreference = (value: string | null): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system';

export const getStoredThemePreference = (): ThemePreference => {
  if (typeof window === 'undefined') return 'system';
  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(value) ? value : 'system';
};

export const resolveTheme = (preference: ThemePreference): 'light' | 'dark' => {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return preference;
};

export const applyThemePreference = (preference: ThemePreference) => {
  const resolvedTheme = resolveTheme(preference);
  const root = document.documentElement;
  root.classList.toggle('dark', resolvedTheme === 'dark');
  root.style.colorScheme = resolvedTheme;
};

export const saveThemePreference = (preference: ThemePreference) => {
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
};
