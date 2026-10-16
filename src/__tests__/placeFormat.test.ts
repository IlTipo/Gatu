import { distanceMeters, formatDistance, formatOpeningHours, phoneHref } from '@/features/places/format';

describe('distanceMeters', () => {
  it('è zero per lo stesso punto', () => {
    expect(distanceMeters({ latitude: 45, longitude: 9 }, { latitude: 45, longitude: 9 })).toBe(0);
  });

  it('Milano Duomo → Roma Colosseo ≈ 477 km', () => {
    const d = distanceMeters({ latitude: 45.4642, longitude: 9.19 }, { latitude: 41.8902, longitude: 12.4922 });
    expect(d / 1000).toBeGreaterThan(470);
    expect(d / 1000).toBeLessThan(485);
  });
});

describe('formatDistance', () => {
  it('metri arrotondati a 10', () => {
    expect(formatDistance(348)).toBe('350 m');
    expect(formatDistance(2)).toBe('10 m');
  });

  it('km con un decimale sotto i 10 km, interi sopra', () => {
    expect(formatDistance(2430)).toBe('2,4 km');
    expect(formatDistance(45_200)).toBe('45 km');
  });
});

describe('formatOpeningHours', () => {
  it('traduce il formato di OpenStreetMap', () => {
    expect(formatOpeningHours('Mo-Sa 12:00-15:00,19:00-23:00; Su off')).toEqual([
      'Lun–Sab 12:00–15:00, 19:00–23:00',
      'Dom chiuso',
    ]);
  });

  it('casi speciali e vuoti', () => {
    expect(formatOpeningHours('24/7')).toEqual(['Sempre aperto']);
    expect(formatOpeningHours(null)).toEqual([]);
    expect(formatOpeningHours('  ')).toEqual([]);
  });

  it('lascia com’è il testo di Google', () => {
    expect(formatOpeningHours('lunedì: 12:00–15:00; martedì: Chiuso')).toEqual(['lunedì: 12:00–15:00', 'martedì: Chiuso']);
  });
});

describe('phoneHref', () => {
  it('tiene solo cifre e +', () => {
    expect(phoneHref('+39 02 1234-567')).toBe('tel:+39021234567');
  });
});
