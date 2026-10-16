import { collectionsContaining, groupCollections, resolveCollection } from '@/features/collections/helpers';

const rows = [
  { id: 'c1', name: 'Cene veloci', emoji: '🍝', position: 0, created_at: '2026-10-01T00:00:00Z', rules: null },
  { id: 'c2', name: 'Weekend a Genova', emoji: '🏖️', position: 1, created_at: '2026-10-02T00:00:00Z', rules: null },
];
const items = [
  { collection_id: 'c1', recipe_id: 'r1', place_id: null },
  { collection_id: 'c1', recipe_id: 'r2', place_id: null },
  { collection_id: 'c2', recipe_id: 'r1', place_id: null },
  { collection_id: 'c2', recipe_id: null, place_id: 'p1' },
];

describe('collezioni', () => {
  const grouped = groupCollections(rows, items);

  it('ogni collezione sa quali ricette e posti contiene', () => {
    expect(grouped.map((c) => [c.recipeIds, c.placeIds])).toEqual([
      [['r1', 'r2'], []],
      [['r1'], ['p1']],
    ]);
  });

  it('trova le collezioni che contengono un elemento', () => {
    expect(collectionsContaining(grouped, { recipeId: 'r1' }).map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(collectionsContaining(grouped, { placeId: 'p1' }).map((c) => c.id)).toEqual(['c2']);
    expect(collectionsContaining(grouped, { recipeId: 'nuova' })).toEqual([]);
  });
});

describe('contenuto di una collezione', () => {
  const recipes = [
    { id: 'r1', tags: ['veloce'], total_minutes: 10, kcal_per_serving: null, difficulty: null },
    { id: 'r2', tags: [], total_minutes: 90, kcal_per_serving: null, difficulty: null },
  ];
  it('manuale: gli elementi scelti; automatica: quelli che rispettano le regole', () => {
    const [manual] = groupCollections(rows, items);
    expect(resolveCollection(manual, recipes, [])).toEqual({ recipeIds: ['r1', 'r2'], placeIds: [] });
    const auto = { ...manual, rules: { max_minutes: 30 }, recipeIds: [], placeIds: [] };
    expect(resolveCollection(auto, recipes, [])).toEqual({ recipeIds: ['r1'], placeIds: [] });
  });
});
