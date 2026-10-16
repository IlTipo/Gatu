import {
  cityCounts,
  filterPlaces,
  filterRecipes,
  type LibraryPlace,
  type LibraryRecipe,
  matchesQuery,
  normalize,
  tagCounts,
} from '@/features/library/filter';

const recipe = (over: Partial<LibraryRecipe>): LibraryRecipe => ({
  id: 'r',
  title: 'Ricetta',
  description: null,
  image_url: null,
  total_minutes: null,
  tags: [],
  kcal_per_serving: null,
  difficulty: null,
  created_at: '2026-10-01T00:00:00Z',
  recipe_ingredients: [],
  ...over,
});

const place = (over: Partial<LibraryPlace>): LibraryPlace => ({
  id: 'p',
  name: 'Locale',
  city: null,
  address: null,
  cuisine: null,
  price_level: null,
  recommended_dishes: [],
  image_url: null,
  wishlist: false,
  verified: false,
  created_at: '2026-10-01T00:00:00Z',
  ...over,
});

const recipes = [
  recipe({ id: 'r1', title: 'Pasta con zucchine', tags: ['primo', 'veloce', 'vegetariano'], recipe_ingredients: [{ name: 'zucchine' }, { name: 'menta' }] }),
  recipe({ id: 'r2', title: 'Crème brûlée', tags: ['dolce'], recipe_ingredients: [{ name: 'panna' }] }),
  recipe({ id: 'r3', title: 'Pollo al curry', tags: ['secondo', 'carne', 'veloce'], recipe_ingredients: [{ name: 'latte di cocco' }] }),
];

const places = [
  place({ id: 'p1', name: 'Trattoria da Mario', city: 'Milano', cuisine: 'milanese', recommended_dishes: ['risotto giallo'], wishlist: true }),
  place({ id: 'p2', name: 'Pizzeria Starita', city: 'Napoli', cuisine: 'pizza' }),
  place({ id: 'p3', name: 'Ramen Bar', city: 'milano ', cuisine: 'giapponese' }),
];

describe('normalize e matchesQuery', () => {
  it('ignora maiuscole, accenti e spazi', () => {
    expect(normalize('  Crème   Brûlée ')).toBe('creme brulee');
  });

  it('ogni parola deve comparire, anche a metà', () => {
    expect(matchesQuery(['Pasta con zucchine'], 'pasta zucc')).toBe(true);
    expect(matchesQuery(['Pasta con zucchine'], 'pasta pomodoro')).toBe(false);
    expect(matchesQuery(['Titolo', null, undefined], '   ')).toBe(true);
  });
});

describe('filterRecipes', () => {
  const none = { query: '', tags: [], collection: null };

  it('senza filtri restituisce tutto', () => {
    expect(filterRecipes(recipes, none)).toHaveLength(3);
  });

  it('cerca anche negli ingredienti e senza accenti', () => {
    expect(filterRecipes(recipes, { ...none, query: 'cocco' }).map((r) => r.id)).toEqual(['r3']);
    expect(filterRecipes(recipes, { ...none, query: 'creme' }).map((r) => r.id)).toEqual(['r2']);
  });

  it('le etichette scelte devono esserci tutte', () => {
    expect(filterRecipes(recipes, { ...none, tags: ['veloce'] }).map((r) => r.id)).toEqual(['r1', 'r3']);
    expect(filterRecipes(recipes, { ...none, tags: ['veloce', 'carne'] }).map((r) => r.id)).toEqual(['r3']);
  });

  it('dentro una collezione', () => {
    const collection = { recipeIds: ['r2', 'r3'], placeIds: [] };
    expect(filterRecipes(recipes, { ...none, collection }).map((r) => r.id)).toEqual(['r2', 'r3']);
    expect(filterRecipes(recipes, { ...none, collection, tags: ['veloce'] }).map((r) => r.id)).toEqual(['r3']);
  });
});

describe('filterPlaces', () => {
  const none = { query: '', wishlistOnly: false, city: null, collection: null };

  it('cerca nei piatti consigliati e nella cucina', () => {
    expect(filterPlaces(places, { ...none, query: 'risotto' }).map((p) => p.id)).toEqual(['p1']);
    expect(filterPlaces(places, { ...none, query: 'giapponese' }).map((p) => p.id)).toEqual(['p3']);
  });

  it('città senza badare a maiuscole e spazi', () => {
    expect(filterPlaces(places, { ...none, city: 'Milano' }).map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  it('solo "voglio andarci" e collezione', () => {
    expect(filterPlaces(places, { ...none, wishlistOnly: true }).map((p) => p.id)).toEqual(['p1']);
    expect(filterPlaces(places, { ...none, collection: { recipeIds: [], placeIds: ['p2'] } }).map((p) => p.id)).toEqual(['p2']);
  });
});

describe('conteggi per i filtri', () => {
  it('etichette dalla più usata', () => {
    expect(tagCounts(recipes).slice(0, 2)).toEqual([
      { value: 'veloce', count: 2 },
      { value: 'carne', count: 1 },
    ]);
  });

  it('città unite e ordinate', () => {
    expect(cityCounts(places)).toEqual([
      { value: 'Milano', count: 2 },
      { value: 'Napoli', count: 1 },
    ]);
  });
});
