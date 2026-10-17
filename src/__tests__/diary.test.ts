import { dayTotals, groupByMealTime, mealTimeFor, parseAmount, progress } from '@/features/diary/logic';

describe('diario calorie', () => {
  it('somma calorie e macro del giorno (anche con valori mancanti)', () => {
    expect(
      dayTotals([
        { kcal: 650, protein_g: 24, carbs_g: 90, fat_g: 18.4 },
        { kcal: 200, protein_g: 20, carbs_g: null, fat_g: 6 },
      ]),
    ).toEqual({ kcal: 850, protein: 44, carbs: 90, fat: 24 });
    expect(dayTotals([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });
  it('barra verso l\'obiettivo', () => {
    expect(progress(1100, 2200)).toBe(0.5);
    expect(progress(3000, 2200)).toBe(1);
    expect(progress(500, null)).toBeNull();
  });
  it('momento della giornata dall\'ora', () => {
    expect(mealTimeFor(8)).toBe('breakfast');
    expect(mealTimeFor(13)).toBe('lunch');
    expect(mealTimeFor(16)).toBe('snack');
    expect(mealTimeFor(20)).toBe('dinner');
    expect(mealTimeFor(1)).toBe('snack');
  });
  it('numeri scritti a mano', () => {
    expect(parseAmount('12,5', 1000)).toBe(12.5);
    expect(parseAmount(' 300 ', 10000)).toBe(300);
    expect(parseAmount('', 1000)).toBeNull();
    expect(parseAmount('-4', 1000)).toBeNull();
    expect(parseAmount('tanta', 1000)).toBeNull();
    expect(parseAmount('20000', 10000)).toBeNull();
  });
  it('raggruppa per colazione, pranzo, cena, spuntino', () => {
    const g = groupByMealTime([{ slot: 'dinner' as const }, { slot: 'breakfast' as const }, { slot: 'dinner' as const }]);
    expect(g.map((x) => [x.slot, x.entries.length])).toEqual([
      ['breakfast', 1],
      ['dinner', 2],
    ]);
  });
});
