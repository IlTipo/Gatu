import type { Slot } from './dates';
import type { MealEntry } from './types';

/** Pasti della settimana per giorno e momento, nell'ordine in cui li hai aggiunti. */
export function groupWeek(entries: MealEntry[]): Map<string, Record<Slot, MealEntry[]>> {
  const map = new Map<string, Record<Slot, MealEntry[]>>();
  const sorted = [...entries].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  for (const e of sorted) {
    const day = map.get(e.date) ?? { lunch: [], dinner: [] };
    day[e.slot].push(e);
    map.set(e.date, day);
  }
  return map;
}

/** Posizione per un nuovo pasto: in fondo a quelli già presenti in quel momento. */
export function nextPosition(entries: MealEntry[], date: string, slot: Slot): number {
  const same = entries.filter((e) => e.date === date && e.slot === slot);
  return same.length ? Math.max(...same.map((e) => e.position)) + 1 : 0;
}

/** Porzioni di un pasto: quelle scelte, altrimenti quelle della ricetta, altrimenti 2. */
export function mealServings(entry: Pick<MealEntry, 'servings'>, recipeServings: number | null | undefined): number {
  return entry.servings ?? recipeServings ?? 2;
}
