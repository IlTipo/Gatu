import { timeAgo } from '@/features/social/time';

describe('quanto tempo fa', () => {
  const now = new Date('2026-10-17T12:00:00Z').getTime();
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();
  it('parole semplici', () => {
    expect(timeAgo(ago(10), now)).toBe('adesso');
    expect(timeAgo(ago(60), now)).toBe('1 minuto fa');
    expect(timeAgo(ago(3 * 3600), now)).toBe('3 ore fa');
    expect(timeAgo(ago(30 * 3600), now)).toBe('ieri');
    expect(timeAgo(ago(3 * 86400), now)).toBe('3 giorni fa');
    expect(timeAgo(ago(14 * 86400), now)).toBe('2 settimane fa');
  });
});
