// Reparti della spesa: l'ordine del TUO supermercato e i reparti che hai scelto tu per certi
// ingredienti ("il tofu per me sta in frigo"). Ricordati su questo dispositivo.

import { useSyncExternalStore } from 'react';

import { ingredientKey } from './build';

export const AISLES = ['frutta_verdura', 'panetteria', 'carne_pesce', 'latticini', 'dispensa', 'surgelati', 'bevande', 'altro'] as const;
export type Aisle = (typeof AISLES)[number];

export const AISLE_EMOJI: Record<string, string> = {
  frutta_verdura: '🥦',
  panetteria: '🥖',
  carne_pesce: '🥩',
  latticini: '🧀',
  dispensa: '🥫',
  surgelati: '🧊',
  bevande: '🧃',
  altro: '🛍️',
};

export type AislePrefs = { order: string[]; overrides: Record<string, string> };

const KEY = 'morso.aisles';
const listeners = new Set<() => void>();
const isAisle = (a: unknown): a is Aisle => typeof a === 'string' && (AISLES as readonly string[]).includes(a);

/** Valori salvati puliti: ordine con tutti i reparti (una volta sola), solo reparti esistenti. */
export function cleanAislePrefs(raw: unknown): AislePrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { order?: unknown; overrides?: unknown };
  const saved = Array.isArray(r.order) ? r.order.filter(isAisle) : [];
  const order = [...new Set([...saved, ...AISLES])];
  const overrides: Record<string, string> = {};
  if (r.overrides && typeof r.overrides === 'object') {
    for (const [k, v] of Object.entries(r.overrides as Record<string, unknown>).slice(0, 500)) if (k && isAisle(v)) overrides[k] = v;
  }
  return { order, overrides };
}

function read(): AislePrefs {
  try {
    return cleanAislePrefs(JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null'));
  } catch {
    return cleanAislePrefs(null);
  }
}

let current = read();

function save(next: AislePrefs) {
  current = next;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(next));
  } catch {
    // memoria non disponibile: vale finché la pagina resta aperta
  }
  listeners.forEach((l) => l());
}

export function getAislePrefs(): AislePrefs {
  return current;
}

export function useAislePrefs(): AislePrefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}

/** Sposta un reparto su (-1) o giù (+1) nell'ordine. */
export function moveAisleInOrder(order: string[], aisle: string, delta: -1 | 1): string[] {
  const i = order.indexOf(aisle);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function setAisleOrder(order: string[]) {
  save(cleanAislePrefs({ ...current, order }));
}

/** Ricorda il reparto scelto per questo ingrediente (vale anche per le prossime liste). */
export function rememberAisle(name: string, aisle: string) {
  const key = ingredientKey(name);
  if (!key || !isAisle(aisle)) return;
  save({ ...current, overrides: { ...current.overrides, [key]: aisle } });
}

/** Il reparto da usare: quello che hai scelto tu, altrimenti quello proposto. */
export function aisleFor(name: string, proposed: string, prefs: AislePrefs = current): string {
  return prefs.overrides[ingredientKey(name)] ?? proposed;
}

export function aisleRank(aisle: string, order: string[]): number {
  const i = order.indexOf(aisle);
  return i < 0 ? order.length : i;
}
