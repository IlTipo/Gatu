import { slotForNow, takeOut } from '@/features/reminders/logic';

const at = (h: number, m = 0) => new Date(2026, 9, 17, h, m);

describe('promemoria', () => {
  it('pranzo, poi cena, poi niente', () => {
    expect(slotForNow(at(9))).toBe('lunch');
    expect(slotForNow(at(14, 29))).toBe('lunch');
    expect(slotForNow(at(14, 30))).toBe('dinner');
    expect(slotForNow(at(21, 29))).toBe('dinner');
    expect(slotForNow(at(22))).toBeNull();
  });
  it('cosa tirare fuori da frigo e freezer', () => {
    expect(
      takeOut([
        { name: 'Guanciale', aisle: 'carne_pesce' },
        { name: 'uova', aisle: 'latticini' },
        { name: 'piselli', aisle: 'surgelati' },
        { name: 'spaghetti', aisle: 'dispensa' },
        { name: 'uova', aisle: 'latticini' },
      ]),
    ).toEqual({ freezer: ['piselli'], fridge: ['guanciale', 'uova'] });
  });
});
