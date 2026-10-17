// Diario calorie: somme del giorno, avanzamento verso gli obiettivi. Niente rete: testabile.

export type MealTime = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const MEAL_TIMES: MealTime[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export type FoodEntry = {
  id: string;
  eaten_on: string;
  slot: MealTime;
  name: string;
  kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  source: 'manual' | 'ai' | 'recipe';
  recipe_id: string | null;
  servings: number | null;
  created_at: string;
};

export type Totals = { kcal: number; protein: number; carbs: number; fat: number };

export function dayTotals(entries: Pick<FoodEntry, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>[]): Totals {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const e of entries) {
    t.kcal += Number(e.kcal) || 0;
    t.protein += Number(e.protein_g) || 0;
    t.carbs += Number(e.carbs_g) || 0;
    t.fat += Number(e.fat_g) || 0;
  }
  return { kcal: Math.round(t.kcal), protein: Math.round(t.protein), carbs: Math.round(t.carbs), fat: Math.round(t.fat) };
}

/** 0..1 per la barra (oltre l'obiettivo resta piena); null se l'obiettivo non c'è. */
export function progress(value: number, goal: number | null | undefined): number | null {
  if (!goal || goal <= 0) return null;
  return Math.min(1, Math.max(0, value / goal));
}

/** Il momento della giornata più probabile in base all'ora. */
export function mealTimeFor(hour: number): MealTime {
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 18 && hour < 23) return 'dinner';
  return 'snack';
}

/** Numero da un campo di testo ("12,5" → 12.5); null se vuoto o non valido. */
export function parseAmount(text: string, max: number): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n * 10) / 10;
}

/** Voci raggruppate per momento della giornata, nell'ordine colazione → spuntino. */
export function groupByMealTime<T extends Pick<FoodEntry, 'slot'>>(entries: T[]): { slot: MealTime; entries: T[] }[] {
  return MEAL_TIMES.map((slot) => ({ slot, entries: entries.filter((e) => e.slot === slot) })).filter((g) => g.entries.length);
}
