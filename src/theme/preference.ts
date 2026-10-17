import { useSyncExternalStore } from 'react';

// Chiaro / Scuro / Automatico (come il telefono): scelta nel Profilo, ricordata su questo dispositivo.
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCE_KEY = 'morso.theme';
const listeners = new Set<() => void>();

export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

function read(): ThemePreference {
  try {
    return parseThemePreference(globalThis.localStorage?.getItem(THEME_PREFERENCE_KEY));
  } catch {
    return 'system';
  }
}

let current = read();

export function setThemePreference(value: ThemePreference) {
  current = value;
  try {
    if (value === 'system') globalThis.localStorage?.removeItem(THEME_PREFERENCE_KEY);
    else globalThis.localStorage?.setItem(THEME_PREFERENCE_KEY, value);
  } catch {
    // memoria del browser non disponibile: la scelta vale finché la pagina resta aperta
  }
  listeners.forEach((l) => l());
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}

/** Lo schema da usare davvero: la scelta dell'utente, oppure quella del telefono. */
export function resolveScheme(preference: ThemePreference, system: string | null | undefined): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  return system === 'dark' ? 'dark' : 'light';
}
