// Palette calda di Morso: crema, terracotta, marroni caldi.
// Ogni colore esiste in versione chiara e scura con gli stessi nomi.

export const palette = {
  light: {
    background: '#FBF7F2',
    surface: '#FFFFFF',
    surfaceMuted: '#F3ECE3',
    border: '#EADFD3',
    text: '#2B1D14',
    textSecondary: '#7A6A5D',
    primary: '#E0592A',
    primaryPressed: '#C44A1F',
    onPrimary: '#FFFFFF',
    success: '#3E8E5E',
    danger: '#C2362B',
    dangerSurface: '#FBE9E7',
  },
  dark: {
    background: '#16110D',
    surface: '#221B16',
    surfaceMuted: '#2C231D',
    border: '#3A2F27',
    text: '#F5EDE4',
    textSecondary: '#B5A595',
    primary: '#F07A4A',
    primaryPressed: '#D9653A',
    onPrimary: '#1A120D',
    success: '#6BBF8A',
    danger: '#F0796E',
    dangerSurface: '#3A1E1A',
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type ThemeColors = { [K in keyof typeof palette.light]: string };
