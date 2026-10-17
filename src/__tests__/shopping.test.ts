import {
  buildShoppingList,
  canonicalUnit,
  displayAmount,
  guessAisle,
  ingredientKey,
  listAsText,
  roundForShopping,
} from '@/features/shopping/build';

const recipes = [
  {
    id: 'pesto',
    title: 'Pasta al pesto',
    servings: 2,
    ingredients: [
      { name: 'spaghetti', quantity: 160, unit: 'g', aisle: 'dispensa' },
      { name: 'basilico', quantity: 1, unit: 'mazzetto', aisle: 'frutta_verdura' },
      { name: 'sale', quantity: null, unit: null, aisle: 'dispensa' },
    ],
  },
  {
    id: 'torta',
    title: 'Torta',
    servings: 8,
    ingredients: [
      { name: 'Farina 00', quantity: 0.3, unit: 'kg', aisle: 'dispensa' },
      { name: 'uova', quantity: 3, unit: null, aisle: 'latticini' },
      { name: 'Sale', quantity: 1, unit: 'pizzico', aisle: 'dispensa' },
    ],
  },
  {
    id: 'pane',
    title: 'Pane',
    servings: 4,
    ingredients: [
      { name: 'farina 00', quantity: 200, unit: 'gr', aisle: 'dispensa' },
      { name: 'uovo', quantity: 1, unit: null, aisle: 'latticini' },
      { name: 'Spaghetti', quantity: 0.2, unit: 'kg', aisle: 'dispensa' },
    ],
  },
];

describe('lista della spesa', () => {
  it('unisce gli stessi ingredienti con unità compatibili (200 g + 0,3 kg = 500 g)', () => {
    const list = buildShoppingList([{ recipe_id: 'torta', servings: 8 }, { recipe_id: 'pane', servings: 4 }], recipes);
    const farina = list.find((l) => l.name.toLowerCase().startsWith('farina'))!;
    expect([farina.quantity, farina.unit, farina.recipe_ids]).toEqual([500, 'g', ['torta', 'pane']]);
    expect(list.find((l) => l.name.startsWith('uov'))!.quantity).toBe(4); // uova + uovo
  });

  it('dosi ricalcolate per le persone del pasto; pezzi per eccesso', () => {
    const list = buildShoppingList([{ recipe_id: 'pesto', servings: 3 }, { recipe_id: 'torta', servings: 4 }], recipes);
    expect(list.find((l) => l.name === 'spaghetti')!.quantity).toBe(240);
    expect(list.find((l) => l.name === 'uova')!.quantity).toBe(2); // 1,5 → 2
  });

  it('"sale q.b." sparisce se il sale c\'è già con una dose; altrimenti resta senza dose', () => {
    const both = buildShoppingList([{ recipe_id: 'pesto', servings: 2 }, { recipe_id: 'torta', servings: 8 }], recipes);
    expect(both.filter((l) => ingredientKey(l.name) === ingredientKey('sale'))).toHaveLength(1);
    const only = buildShoppingList([{ recipe_id: 'pesto', servings: 2 }], recipes);
    expect(only.find((l) => l.name === 'sale')).toMatchObject({ quantity: null, unit: null });
  });

  it('la stessa ricetta due volte nella settimana conta due volte', () => {
    const list = buildShoppingList([{ recipe_id: 'pesto', servings: 2 }, { recipe_id: 'pesto', servings: 2 }], recipes);
    expect(list.find((l) => l.name === 'spaghetti')!.quantity).toBe(320);
    expect(list.find((l) => l.name === 'spaghetti')!.recipe_ids).toEqual(['pesto']);
  });

  it('ordinata per reparto; ricette sconosciute ignorate', () => {
    const list = buildShoppingList([{ recipe_id: 'pesto', servings: 2 }, { recipe_id: 'sparita', servings: 2 }], recipes);
    expect(list.map((l) => l.aisle)).toEqual(['dispensa', 'dispensa', 'frutta_verdura']);
  });
});

describe('unità e arrotondamenti', () => {
  it('unità canoniche', () => {
    expect(canonicalUnit('Kg')).toEqual({ unit: 'g', factor: 1000 });
    expect(canonicalUnit('cucchiai')).toEqual({ unit: 'cucchiaio', factor: 1 });
    expect(canonicalUnit(' ')).toEqual({ unit: null, factor: 1 });
  });

  it('arrotondamenti e visualizzazione', () => {
    expect(roundForShopping(133, 'g')).toBe(130);
    expect(roundForShopping(2.1, null)).toBe(3);
    expect(roundForShopping(1.6, 'cucchiaio')).toBe(1.5);
    expect(roundForShopping(1.5, 'mazzetto')).toBe(2);
    expect(displayAmount(1500, 'g')).toEqual({ quantity: 1.5, unit: 'kg' });
    expect(displayAmount(750, 'ml')).toEqual({ quantity: 750, unit: 'ml' });
  });
});

describe('aggiunte a mano e testo', () => {
  it('indovina il reparto', () => {
    expect(guessAisle('Latte intero')).toBe('latticini');
    expect(guessAisle('mele')).toBe('frutta_verdura');
    expect(guessAisle('detersivo')).toBe('altro');
  });

  it('testo della lista senza le cose già prese', () => {
    const text = listAsText(
      'Spesa',
      [
        { name: 'latte', quantity: 1, unit: 'l', aisle: 'latticini', checked: false },
        { name: 'pane', quantity: null, unit: null, aisle: 'panetteria', checked: true },
      ],
      (a) => a.toUpperCase(),
      (i) => `${i.quantity ?? ''} ${i.unit ?? ''} ${i.name}`.trim(),
    );
    expect(text).toBe('Spesa\n\nLATTICINI\n- 1 l latte');
  });
});
