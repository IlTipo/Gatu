import { boundsOf, mappable } from '@/features/map/logic';

const p = (id: string, latitude: number | null, longitude: number | null) => ({
  id,
  name: id,
  city: null,
  cuisine: null,
  price_level: null,
  latitude,
  longitude,
  wishlist: false,
});

describe('mappa', () => {
  it('mostra solo i posti con coordinate valide', () => {
    const list = [p('ok', 45.46, 9.19), p('senza', null, null), p('zero', 0, 0), p('rotto', 120, 9)];
    expect(mappable(list).map((x) => x.id)).toEqual(['ok']);
  });

  it('inquadratura che li contiene tutti', () => {
    expect(boundsOf([{ latitude: 45.46, longitude: 9.19 }, { latitude: 40.85, longitude: 14.27 }])).toEqual([
      [40.85, 9.19],
      [45.46, 14.27],
    ]);
    expect(boundsOf([])).toBeNull();
  });
});
