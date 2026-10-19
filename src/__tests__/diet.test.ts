import { dayIndexFor, diarySlot, optionIngredients, optionsFromText } from '@/features/diet/types';

describe('piano alimentare', () => {
  const plan = {
    days: [
      { label: 'Lunedì', weekday: 1, meals: [] },
      { label: 'Martedì', weekday: 2, meals: [] },
    ],
  };
  it('trova il giorno di oggi', () => {
    expect(dayIndexFor(plan, new Date(2026, 9, 20))).toBe(1); // martedì
    expect(dayIndexFor({ days: [{ label: 'Tutti i giorni', weekday: null, meals: [] }] }, new Date(2026, 9, 25))).toBe(0);
  });
  it('alimenti di un pasto scritto a mano', () => {
    expect(optionIngredients({ text: '80 g pasta integrale + verdure, 1 cucchiaio di olio', items: [] })).toEqual([
      'pasta integrale',
      'verdure',
      'olio',
    ]);
    expect(optionIngredients({ text: 'x', items: [{ name: 'Riso', quantity: 80, unit: 'g' }] })).toEqual(['riso']);
  });
  it('una riga per alternativa', () => {
    expect(optionsFromText('yogurt e frutta\noppure 2 fette biscottate\n\n').map((o) => o.text)).toEqual([
      'yogurt e frutta',
      '2 fette biscottate',
    ]);
  });
  it('pasto → momento del diario', () => {
    expect(diarySlot('merenda')).toBe('snack');
    expect(diarySlot('cena')).toBe('dinner');
  });
});
