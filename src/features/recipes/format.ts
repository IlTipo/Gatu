import type { Ingredient } from './types';

/** 0.5 → "0,5" · 1.333 → "1,33" · 200 → "200" (formato italiano, al massimo 2 decimali). */
export function formatQuantity(q: number | null): string {
  if (q === null) return '';
  const rounded = Math.round(q * 100) / 100;
  return rounded.toLocaleString('it-IT', { maximumFractionDigits: 2 });
}

/** "200 g spaghetti" · "1 limone" · "sale (q.b.)" */
export function formatIngredient(i: Pick<Ingredient, 'quantity' | 'unit' | 'name' | 'note'>): string {
  const amount = [formatQuantity(i.quantity), i.unit ?? ''].filter(Boolean).join(' ');
  return [amount, i.name].filter(Boolean).join(' ') + (i.note ? ` (${i.note})` : '');
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
