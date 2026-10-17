import { adjustNutrition, cleanPrefs, personalize, portionCategory } from '@/features/portions/logic';

describe('tipo di ingrediente', () => {
  it('riconosce pasta, riso, carne e pesce', () => {
    expect(portionCategory('Spaghetti')).toBe('pasta');
    expect(portionCategory('mezze maniche rigate')).toBe('pasta');
    expect(portionCategory('Riso Carnaroli')).toBe('riso');
    expect(portionCategory('petto di pollo')).toBe('carne');
    expect(portionCategory('filetto di salmone')).toBe('pesce');
    expect(portionCategory('Baccalà')).toBe('pesce');
  });
  it('ignora quello che non è la porzione', () => {
    expect(portionCategory('pasta frolla')).toBeNull();
    expect(portionCategory('pasta sfoglia')).toBeNull();
    expect(portionCategory('farina di riso')).toBeNull();
    expect(portionCategory('guanciale')).toBeNull();
    expect(portionCategory('brodo di pollo')).toBeNull();
    expect(portionCategory('gnocchi di patate')).toBeNull();
    expect(portionCategory('pecorino')).toBeNull();
    expect(portionCategory('risorse')).toBeNull();
  });
});

describe('porzioni preferite', () => {
  const carbonara = [
    { name: 'spaghetti', quantity: 320, unit: 'g' },
    { name: 'guanciale', quantity: 150, unit: 'g' },
    { name: 'uova', quantity: 4, unit: null },
  ];
  it('pasta a 100 g a persona: 4 persone → 400 g; il resto non cambia', () => {
    const { ingredients, deltaPerPerson } = personalize(carbonara, 4, { pasta: 100 });
    expect(ingredients[0]).toMatchObject({ quantity: 400, personalized: true });
    expect(ingredients[1]).toEqual(carbonara[1]);
    expect(ingredients[2]).toEqual(carbonara[2]);
    expect(deltaPerPerson.pasta).toBe(20);
  });
  it('in kg resta in kg', () => {
    const { ingredients } = personalize([{ name: 'riso', quantity: 0.32, unit: 'kg' }], 4, { riso: 90 });
    expect(ingredients[0].quantity).toBeCloseTo(0.36);
  });
  it('un po\' di salsiccia nel sugo non è la porzione di carne', () => {
    const { ingredients } = personalize([{ name: 'salsiccia', quantity: 100, unit: 'g' }], 4, { carne: 200 });
    expect(ingredients[0].quantity).toBe(100);
  });
  it('senza preferenze o senza porzioni non cambia niente', () => {
    expect(personalize(carbonara, 4, {}).ingredients).toBe(carbonara);
    expect(personalize(carbonara, null, { pasta: 100 }).ingredients).toBe(carbonara);
  });
  it('calorie e macro seguono i grammi', () => {
    const n = adjustNutrition({ kcal: 600, protein: 25, carbs: 70, fat: 25 }, { pasta: 20 });
    expect(n.kcal).toBe(671);
    expect(n.carbs).toBeCloseTo(84.2);
    expect(adjustNutrition({ kcal: null, protein: null, carbs: null, fat: null }, { pasta: 20 }).kcal).toBeNull();
  });
  it('valori salvati strani vengono sistemati', () => {
    expect(cleanPrefs({ pasta: 95.4, riso: 9999, carne: 'tanta', altro: 3 })).toEqual({ pasta: 95, riso: 500 });
    expect(cleanPrefs(null)).toEqual({});
  });
});
