import { isStaple, matchPantry, pickRandom, splitPantryInput } from '@/features/library/pantry';

const r = (id: string, ...names: string[]) => ({ id, recipe_ingredients: names.map((name) => ({ name })) });

const recipes = [
  r('frittata', 'uova', 'zucchine', 'parmigiano', 'sale', 'olio extravergine di oliva'),
  r('carbonara', 'spaghetti', 'guanciale', 'tuorli', 'pecorino romano', 'pepe nero'),
  r('tiramisu', 'mascarpone', 'savoiardi', 'caffè', 'uova', 'zucchero'),
  r('insalata', 'lattuga', 'pomodori'),
];

describe('matchPantry', () => {
  it('prima la ricetta a cui manca meno; sale e olio non contano', () => {
    const res = matchPantry(recipes, ['uova', 'zucchina', 'parmigiano']);
    expect(res[0].recipe.id).toBe('frittata');
    expect(res[0].missing).toEqual([]);
    expect(res.map((m) => m.recipe.id)).not.toContain('insalata');
  });

  it('nomi generici: "pasta", "formaggio", "uova" coprono quelli specifici', () => {
    const [carbonara] = matchPantry(recipes, ['pasta', 'formaggio', 'uova']).filter((m) => m.recipe.id === 'carbonara');
    expect(carbonara.have).toEqual(['spaghetti', 'tuorli', 'pecorino romano']);
    expect(carbonara.missing).toEqual(['guanciale']);
  });

  it('niente in dispensa → niente risultati', () => {
    expect(matchPantry(recipes, [' '])).toEqual([]);
  });

  it('ingredienti di base', () => {
    expect(isStaple('Sale fino')).toBe(true);
    expect(isStaple('olio extravergine')).toBe(true);
    expect(isStaple('salmone')).toBe(false);
  });
});

describe('splitPantryInput', () => {
  it('separa con virgole e "e"', () => {
    expect(splitPantryInput('Uova, zucchine e parmigiano;  latte ')).toEqual(['uova', 'zucchine', 'parmigiano', 'latte']);
  });
});

describe('pickRandom', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('non ripete quella appena uscita', () => {
    expect(pickRandom(list, 'a', () => 0)!.id).toBe('b');
    expect(pickRandom(list, null, () => 0)!.id).toBe('a');
  });
  it('lista vuota o con un solo elemento', () => {
    expect(pickRandom([], null)).toBeNull();
    expect(pickRandom([{ id: 'x' }], 'x')!.id).toBe('x');
  });
});
