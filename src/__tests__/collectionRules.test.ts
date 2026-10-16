import { applyRules, cleanRules, describeRules } from '@/features/collections/rules';

const recipes = [
  { id: 'r1', tags: ['vegetariano', 'veloce'], total_minutes: 20, kcal_per_serving: 450, difficulty: 'facile' },
  { id: 'r2', tags: ['vegetariano'], total_minutes: 50, kcal_per_serving: null, difficulty: 'media' },
  { id: 'r3', tags: ['carne'], total_minutes: 15, kcal_per_serving: 700, difficulty: 'facile' },
];
const places = [
  { id: 'p1', city: 'Milano', wishlist: true },
  { id: 'p2', city: ' milano', wishlist: false },
  { id: 'p3', city: 'Roma', wishlist: true },
];

describe('collezioni automatiche', () => {
  it('etichette e tempo massimo', () => {
    expect(applyRules({ tags: ['vegetariano'], max_minutes: 30 }, recipes, places)).toEqual({ recipeIds: ['r1'], placeIds: [] });
  });

  it('calorie: le ricette senza calorie non entrano', () => {
    expect(applyRules({ max_kcal: 600 }, recipes, places).recipeIds).toEqual(['r1']);
  });

  it('difficoltà', () => {
    expect(applyRules({ difficulty: 'facile' }, recipes, places).recipeIds).toEqual(['r1', 'r3']);
  });

  it('posti: città (senza badare a maiuscole) e "voglio andarci"', () => {
    expect(applyRules({ city: 'MILANO' }, recipes, places)).toEqual({ recipeIds: [], placeIds: ['p1', 'p2'] });
    expect(applyRules({ wishlist: true }, recipes, places).placeIds).toEqual(['p1', 'p3']);
  });

  it('cleanRules toglie i vuoti; nessuna regola → null', () => {
    expect(cleanRules({ tags: [], max_minutes: null, city: '  ', wishlist: false })).toBeNull();
    expect(cleanRules({ tags: ['veloce', 'veloce'], max_minutes: 30, city: ' Genova ' })).toEqual({
      tags: ['veloce'],
      max_minutes: 30,
      city: 'Genova',
    });
  });

  it('riassunto leggibile', () => {
    expect(describeRules({ tags: ['vegetariano'], max_minutes: 30, max_kcal: 600, wishlist: true })).toBe(
      'vegetariano · ≤ 30 min · ≤ 600 kcal · ❤️',
    );
  });
});
