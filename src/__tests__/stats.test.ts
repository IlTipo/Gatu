import { cookedThisMonth, cookingStreak, favoriteRecipe, lastWeekKcal, libraryCounts, topTags } from '@/features/stats/logic';

// date a mezzogiorno locale, così il giorno non cambia con il fuso
const at = (day: string) => new Date(`${day}T12:00:00`).toISOString();
const recipes = [
  { id: 'a', title: 'Carbonara', tags: ['primo', 'veloce'], status: 'tried', rating: 5 },
  { id: 'b', title: 'Insalata', tags: ['veloce', 'vegetariano'], status: 'to_try', rating: null },
];
const events = [
  { recipe_id: 'a', cooked_at: at('2026-10-17') },
  { recipe_id: 'a', cooked_at: at('2026-10-16') },
  { recipe_id: 'b', cooked_at: at('2026-10-15') },
  { recipe_id: 'a', cooked_at: at('2026-09-30') },
];

describe('statistiche', () => {
  it('cucinate questo mese e il mese prima', () => {
    expect(cookedThisMonth(events, '2026-10-17')).toEqual({ now: 3, before: 1 });
    expect(cookedThisMonth([{ recipe_id: 'a', cooked_at: at('2025-12-20') }], '2026-01-05')).toEqual({ now: 0, before: 1 });
  });
  it('etichette più cucinate', () => {
    expect(topTags(recipes, events)).toEqual([
      { label: 'veloce', count: 4 },
      { label: 'primo', count: 3 },
      { label: 'vegetariano', count: 1 },
    ]);
    expect(topTags(recipes, [])[0]).toEqual({ label: 'veloce', count: 2 });
  });
  it('ricetta preferita e giorni di fila', () => {
    expect(favoriteRecipe(recipes, events)).toEqual({ title: 'Carbonara', times: 3 });
    expect(favoriteRecipe(recipes, [])).toBeNull();
    expect(cookingStreak(events, '2026-10-17')).toBe(3);
    expect(cookingStreak(events, '2026-10-18')).toBe(3); // oggi non ancora, ma ieri sì
    expect(cookingStreak(events, '2026-10-20')).toBe(0);
  });
  it('calorie della settimana', () => {
    const w = lastWeekKcal(
      [
        { eaten_on: '2026-10-17', kcal: 1800 },
        { eaten_on: '2026-10-17', kcal: 200 },
        { eaten_on: '2026-10-15', kcal: 1600 },
        { eaten_on: '2026-10-01', kcal: 9999 },
      ],
      '2026-10-17',
    );
    expect(w.days).toHaveLength(7);
    expect(w.days[6]).toEqual({ date: '2026-10-17', kcal: 2000 });
    expect(w.average).toBe(1800);
    expect(lastWeekKcal([], '2026-10-17').average).toBeNull();
  });
  it('conti della libreria', () => {
    expect(libraryCounts(recipes, [{ status: 'tried', cuisine: 'pizza', rating: 4 }])).toEqual({
      recipes: 2,
      triedRecipes: 1,
      places: 1,
      visitedPlaces: 1,
      averageRating: 4.5,
    });
  });
});
