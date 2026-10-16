import type { Ingredient } from './types';

/** 0.5 → "0,5" · 1.333 → "1,33" · 200 → "200" (formato italiano, al massimo 2 decimali). */
export function formatQuantity(q: number | null): string {
  if (q === null) return '';
  const rounded = Math.round(q * 100) / 100;
  return rounded.toLocaleString('it-IT', { maximumFractionDigits: 2 });
}

const UNIT_PLURALS: Record<string, string> = {
  spicchio: 'spicchi',
  cucchiaio: 'cucchiai',
  cucchiaino: 'cucchiaini',
  fetta: 'fette',
  foglia: 'foglie',
  tazza: 'tazze',
  bicchiere: 'bicchieri',
  pezzo: 'pezzi',
  mazzetto: 'mazzetti',
  rametto: 'rametti',
  bustina: 'bustine',
  vasetto: 'vasetti',
  lattina: 'lattine',
  pizzico: 'pizzichi',
};

/** "2 spicchio" → "2 spicchi" (sopra l'uno l'unità va al plurale) */
export function unitFor(quantity: number | null, unit: string | null): string | null {
  if (!unit) return null;
  return quantity !== null && quantity > 1 ? (UNIT_PLURALS[unit.toLowerCase()] ?? unit) : unit;
}

/** "200 g spaghetti" · "1 limone" · "sale (q.b.)" · "~2 zucchine" (dose stimata) */
export function formatIngredient(i: Pick<Ingredient, 'quantity' | 'unit' | 'name' | 'note'> & { estimated?: boolean }): string {
  const amount = [formatQuantity(i.quantity), unitFor(i.quantity, i.unit) ?? ''].filter(Boolean).join(' ');
  const prefix = i.estimated && i.quantity !== null ? '~' : '';
  return prefix + [amount, i.name].filter(Boolean).join(' ') + (i.note ? ` (${i.note})` : '');
}

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/**
 * Ricalcola una dose per un altro numero di persone, con arrotondamenti "da cucina":
 * 133 g → 135 g · 1,33 uova → 1,5 · 0,4 cucchiai → 0,5. Il pizzico resta un pizzico.
 */
export function scaleQuantity(quantity: number | null, unit: string | null, factor: number): number | null {
  if (quantity === null) return null;
  if (factor === 1) return quantity;
  const value = quantity * factor;
  const u = (unit ?? '').toLowerCase();
  if (u === 'pizzico') return quantity;
  if (u === 'g' || u === 'ml') {
    if (value < 10) return Math.max(1, Math.round(value));
    if (value < 100) return roundTo(value, 5);
    return roundTo(value, 10);
  }
  if (u === 'kg' || u === 'l') return Math.max(0.05, Math.round(roundTo(value, 0.05) * 100) / 100);
  // cucchiai, pezzi, uova, spicchi…: al mezzo più vicino (minimo mezzo)
  return Math.max(0.5, roundTo(value, 0.5));
}

/** C'è qualcosa da stimare? (porzioni mancanti o dosi mancanti che non siano "q.b.") */
export function hasMissingDoses(servings: number | null, ingredients: Pick<Ingredient, 'quantity' | 'note'>[]): boolean {
  const toTaste = (note: string | null) => /\bq\.?\s?b\.?|quanto basta|a piacere/i.test(note ?? '');
  return servings === null || ingredients.some((i) => i.quantity === null && !toTaste(i.note));
}

/** 95 → "1 h 35 min" · 20 → "20 min" */
export function formatMinutes(minutes: number | null): string | null {
  if (minutes === null || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Legge un numero scritto da una persona: "0,5" → 0.5 · "" → null · "abc" → null */
export function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(',', '.');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
