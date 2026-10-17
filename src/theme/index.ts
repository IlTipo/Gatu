import { useColorScheme } from 'react-native';

import { palette, type ThemeColors } from './colors';
import { resolveScheme, useThemePreference } from './preference';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800' },
  heading: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;

export type TypographyVariant = keyof typeof typography;

export type Theme = {
  scheme: 'light' | 'dark';
  colors: ThemeColors;
};

/** Restituisce colori e schema (chiaro/scuro): la scelta del Profilo o, in automatico, quella del telefono. */
export function useTheme(): Theme {
  const scheme = resolveScheme(useThemePreference(), useColorScheme());
  return { scheme, colors: palette[scheme] };
}

export { palette };
export { setThemePreference, useThemePreference, type ThemePreference } from './preference';
