import {
  addDays,
  dayLabel,
  isValidISODate,
  nextMealSlot,
  shortDayLabel,
  startOfWeek,
  toISODate,
  weekDays,
  weekLabel,
} from '@/features/planner/dates';

describe('date del planner', () => {
  it('data locale, non UTC (di sera resta lo stesso giorno)', () => {
    expect(toISODate(new Date(2026, 9, 19, 23, 30))).toBe('2026-10-19');
  });

  it('la settimana parte dal lunedì, anche di domenica', () => {
    expect(startOfWeek('2026-10-19')).toBe('2026-10-19'); // lunedì
    expect(startOfWeek('2026-10-25')).toBe('2026-10-19'); // domenica
    expect(startOfWeek('2026-10-22')).toBe('2026-10-19');
  });

  it('giorni della settimana e cambi di mese/anno', () => {
    expect(weekDays('2026-12-28')).toEqual([
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
    ]);
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // passa il cambio dell'ora
  });

  it('etichette in italiano', () => {
    expect(dayLabel('2026-10-19')).toBe('Lunedì 19');
    expect(shortDayLabel('2026-10-25')).toBe('dom 25 ott');
    expect(weekLabel('2026-10-19')).toBe('19–25 ottobre 2026');
    expect(weekLabel('2026-10-26')).toBe('26 ottobre – 1 novembre 2026');
    expect(weekLabel('2026-12-28')).toBe('28 dicembre 2026 – 3 gennaio 2027');
  });

  it('date valide', () => {
    expect(isValidISODate('2026-02-28')).toBe(true);
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('ieri')).toBe(false);
  });

  it('pasto proposto', () => {
    expect(nextMealSlot(new Date(2026, 9, 19, 11))).toEqual({ date: '2026-10-19', slot: 'lunch' });
    expect(nextMealSlot(new Date(2026, 9, 19, 18))).toEqual({ date: '2026-10-19', slot: 'dinner' });
  });
});
