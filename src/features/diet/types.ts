// Il mio piano alimentare: giorni → pasti → alternative ("oppure") → alimenti.

export const DIET_SLOTS = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena', 'altro'] as const;
export type DietSlot = (typeof DIET_SLOTS)[number];
export type DietItem = { name: string; quantity: number | null; unit: string | null };
/** kcal: calorie stimate per una persona (null o assente: non ancora calcolate) */
export type DietOption = { text: string; items: DietItem[]; kcal?: number | null };
export type DietMeal = { slot: DietSlot; options: DietOption[] };
export type DietDay = { label: string; weekday: number | null; meals: DietMeal[] };
export type DietPlan = { title: string | null; notes: string[]; days: DietDay[] };

export const SLOT_EMOJI: Record<DietSlot, string> = {
  colazione: '☕',
  spuntino: '🍎',
  pranzo: '🍝',
  merenda: '🥪',
  cena: '🌙',
  altro: '🍽️',
};

/** Pasto del piano → momento del diario calorie. */
export function diarySlot(slot: DietSlot): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  return slot === 'colazione' ? 'breakfast' : slot === 'pranzo' ? 'lunch' : slot === 'cena' ? 'dinner' : 'snack';
}

/** Il giorno del piano per oggi: quello con lo stesso giorno della settimana, oppure in ordine (giorno 1, 2…). */
export function dayIndexFor(plan: Pick<DietPlan, 'days'>, date: Date): number {
  if (!plan.days.length) return 0;
  const weekday = ((date.getDay() + 6) % 7) + 1; // 1 lunedì … 7 domenica
  const exact = plan.days.findIndex((d) => d.weekday === weekday);
  if (exact >= 0) return exact;
  return (weekday - 1) % plan.days.length;
}

/** Alimenti di un'alternativa (dalla lettura dell'AI, o dal testo scritto a mano: "pasta + verdure, olio"). */
export function optionIngredients(option: DietOption): string[] {
  const names = option.items.length
    ? option.items.map((i) => i.name)
    : option.text
        .split(/\s*(?:\+|,|;|\be\b|\bcon\b)\s*/i)
        .map((p) => p.replace(/^\d+([.,]\d+)?\s*(g|gr|kg|ml|l|pz|cucchiai[oa]?|cucchiaini?|fett[ae])?\s*(di\s+)?/i, '').trim());
  return [...new Set(names.map((n) => n.toLowerCase()).filter((n) => n.length > 1))].slice(0, 15);
}

/** Testo scritto a mano (una riga per alternativa) → alternative del pasto. */
export function optionsFromText(text: string): DietOption[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(oppure|o|-|•)\s+/i, '').trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((line) => ({ text: line.slice(0, 300), items: [] }));
}
