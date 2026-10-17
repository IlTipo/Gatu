// Username (@nome): stesse regole del database. Solo minuscole, numeri, punto e trattino basso,
// da 3 a 30 caratteri, senza punto all'inizio, alla fine o due punti di fila.

import { normalize } from '@/features/library/filter';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

export function isValidUsername(value: string): boolean {
  return /^[a-z0-9._]{3,30}$/.test(value) && !value.startsWith('.') && !value.endsWith('.') && !value.includes('..');
}

/** Pulisce quello che scrivi: "Giulia Rossi!" → "giulia.rossi" (lettere accentate senza accento). */
export function cleanUsername(input: string): string {
  return normalize(input)
    .replace(/^@+/, '')
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._]/g, '')
    .replace(/\.{2,}/g, '.')
    .slice(0, USERNAME_MAX);
}

/** Una proposta dal nome (o dalla parte prima della @ dell'email). */
export function suggestUsername(name: string | null | undefined, email: string | null | undefined): string {
  const base = cleanUsername(name || email?.split('@')[0] || '').replace(/^\.+|\.+$/g, '');
  if (base.length >= USERNAME_MIN) return base;
  return `${base || 'chef'}${Math.floor(100 + Math.random() * 900)}`.slice(0, USERNAME_MAX);
}
