import { formatWhen, starsText } from '@/features/ratings/format';

describe('voti e date', () => {
  const now = new Date(2026, 9, 17, 20, 0);
  it('quando: oggi, ieri, giorni fa, data', () => {
    expect(formatWhen(new Date(2026, 9, 17, 8).toISOString(), now)).toBe('oggi');
    expect(formatWhen(new Date(2026, 9, 16, 23).toISOString(), now)).toBe('ieri');
    expect(formatWhen(new Date(2026, 9, 14, 12).toISOString(), now)).toBe('3 giorni fa');
    expect(formatWhen(new Date(2026, 9, 2, 12).toISOString(), now)).toBe('il 2 ottobre');
    expect(formatWhen(new Date(2025, 2, 3, 12).toISOString(), now)).toBe('il 3 marzo 2025');
  });

  it('stelle', () => {
    expect(starsText(3)).toBe('★★★☆☆');
    expect(starsText(null)).toBe('');
  });
});
