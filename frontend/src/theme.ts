export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'seo-dashboard-theme';

type ThemeRoles = {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  surface: string;
  surfaceVariant: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  error: string;
  onError: string;
};

export type ThemeTokens = {
  color: {
    roles: ThemeRoles;
  };
};

export type ThemeMode = 'light' | 'dark';

const fixedRolePalettes: Record<ThemeMode, ThemeRoles> = {
  light: {
    primary: '#14638F',
    onPrimary: '#FFFFFF',
    primaryContainer: '#C8E6FF',
    onPrimaryContainer: '#001E2F',
    surface: '#F7FAFD',
    surfaceVariant: '#E6EEF5',
    onSurface: '#171C22',
    onSurfaceVariant: '#414B57',
    outline: '#707A86',
    error: '#BA1A1A',
    onError: '#FFFFFF',
  },
  dark: {
    primary: '#8FD1FF',
    onPrimary: '#00344F',
    primaryContainer: '#004B6F',
    onPrimaryContainer: '#C8E6FF',
    surface: '#0F141A',
    surfaceVariant: '#2A323B',
    onSurface: '#DFE3EA',
    onSurfaceVariant: '#C0C7D1',
    outline: '#8A939E',
    error: '#FFB4AB',
    onError: '#690005',
  },
};

/**
 * Placeholder for future dynamic color generation.
 * Currently uses a fixed role mapping and keeps the brand color as the primary role.
 */
export const generatePaletteFromBrandColor = (brandColor: string, mode: ThemeMode): ThemeTokens => ({
  color: {
    roles: {
      ...fixedRolePalettes[mode],
      primary: brandColor,
    },
  },
});

export const themeTokens: Record<ThemeMode, ThemeTokens> = {
  light: generatePaletteFromBrandColor('#14638F', 'light'),
  dark: generatePaletteFromBrandColor('#8FD1FF', 'dark'),
};

const isThemePreference = (value: string | null): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system';

export const getStoredThemePreference = (): ThemePreference => {
  if (typeof window === 'undefined') return 'system';
  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(value) ? value : 'system';
};

export const resolveTheme = (preference: ThemePreference): ThemeMode => {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return preference;
};

const applyThemeTokens = (mode: ThemeMode) => {
  const roles = themeTokens[mode].color.roles;
  const root = document.documentElement;

  root.style.setProperty('--md-sys-color-primary', roles.primary);
  root.style.setProperty('--md-sys-color-on-primary', roles.onPrimary);
  root.style.setProperty('--md-sys-color-primary-container', roles.primaryContainer);
  root.style.setProperty('--md-sys-color-on-primary-container', roles.onPrimaryContainer);
  root.style.setProperty('--md-sys-color-surface', roles.surface);
  root.style.setProperty('--md-sys-color-surface-variant', roles.surfaceVariant);
  root.style.setProperty('--md-sys-color-on-surface', roles.onSurface);
  root.style.setProperty('--md-sys-color-on-surface-variant', roles.onSurfaceVariant);
  root.style.setProperty('--md-sys-color-outline', roles.outline);
  root.style.setProperty('--md-sys-color-error', roles.error);
  root.style.setProperty('--md-sys-color-on-error', roles.onError);
};

export const applyThemePreference = (preference: ThemePreference) => {
  const resolvedTheme = resolveTheme(preference);
  const root = document.documentElement;
  root.classList.toggle('dark', resolvedTheme === 'dark');
  root.style.colorScheme = resolvedTheme;
  applyThemeTokens(resolvedTheme);
};

export const saveThemePreference = (preference: ThemePreference) => {
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
};
