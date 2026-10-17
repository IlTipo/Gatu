import { groupWeek, mealServings, nextPosition } from '@/features/planner/helpers';
import type { MealEntry } from '@/features/planner/types';

const e = (id: string, date: string, slot: 'lunch' | 'dinner', position: number): MealEntry => ({
  id,
  date,
  slot,
  recipe_id: `r-${id}`,
  servings: null,
  position,
  created_at: `2026-10-01T00:00:0${id.length}Z`,
});

describe('planner', () => {
  const entries = [e('a', '2026-10-19', 'dinner', 1), e('b', '2026-10-19', 'dinner', 0), e('c', '2026-10-20', 'lunch', 0)];

  it('raggruppa per giorno e momento, in ordine', () => {
    const week = groupWeek(entries);
    expect(week.get('2026-10-19')!.dinner.map((x) => x.id)).toEqual(['b', 'a']);
    expect(week.get('2026-10-19')!.lunch).toEqual([]);
    expect(week.get('2026-10-20')!.lunch.map((x) => x.id)).toEqual(['c']);
    expect(week.get('2026-10-21')).toBeUndefined();
  });

  it('nuovo pasto in fondo', () => {
    expect(nextPosition(entries, '2026-10-19', 'dinner')).toBe(2);
    expect(nextPosition(entries, '2026-10-19', 'lunch')).toBe(0);
  });

  it('porzioni: scelte, della ricetta o 2', () => {
    expect(mealServings({ servings: 4 }, 2)).toBe(4);
    expect(mealServings({ servings: null }, 3)).toBe(3);
    expect(mealServings({ servings: null }, null)).toBe(2);
  });
});
