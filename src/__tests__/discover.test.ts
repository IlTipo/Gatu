import { buildOverpassQuery, isAlreadySaved, parseOverpass, translateCuisine } from '@/features/places/discover';

const me = { latitude: 45.4642, longitude: 9.19 };

describe('scopri in zona (OpenStreetMap)', () => {
  it('richiesta con raggio limitato', () => {
    expect(buildOverpassQuery(me, 2000)).toContain('around:2000,45.46420,9.19000');
    expect(buildOverpassQuery(me, 999999)).toContain('around:10000,');
  });
  it('cucine tradotte', () => {
    expect(translateCuisine('pizza;italian')).toBe('pizza, italiana');
    expect(translateCuisine('fusion_food')).toBe('fusion food');
    expect(translateCuisine(undefined)).toBeNull();
  });
  it('legge la risposta: nomi, tipo, indirizzo, siti solo http(s), dal più vicino', () => {
    const res = parseOverpass(
      {
        elements: [
          { type: 'node', id: 1, lat: 45.47, lon: 9.19, tags: { amenity: 'restaurant', name: 'Lontano', cuisine: 'sushi' } },
          {
            type: 'way',
            id: 2,
            center: { lat: 45.4645, lon: 9.1901 },
            tags: { amenity: 'restaurant', name: 'Pizzeria Da Gino', cuisine: 'pizza', 'addr:street': 'Via Roma', 'addr:housenumber': '3', website: 'javascript:alert(1)' },
          },
          { type: 'node', id: 3, lat: 45.4643, lon: 9.19, tags: { amenity: 'cafe' } },
          { type: 'node', id: 4, lat: 45.4644, lon: 9.19, tags: { amenity: 'ice_cream', name: 'Gelateria', website: 'https://gelato.example' } },
        ],
      },
      me,
    );
    expect(res.map((r) => r.name)).toEqual(['Gelateria', 'Pizzeria Da Gino', 'Lontano']);
    expect(res[1]).toMatchObject({ kind: 'pizza', address: 'Via Roma 3', website: null, cuisine: 'pizza' });
    expect(res[0]).toMatchObject({ kind: 'ice_cream', website: 'https://gelato.example' });
    expect(parseOverpass(null, me)).toEqual([]);
  });
  it('riconosce i posti già salvati', () => {
    const p = { name: 'Pizzeria Da Gino', latitude: 45.4645, longitude: 9.1901 };
    expect(isAlreadySaved(p, [{ name: 'pizzeria da gino', latitude: 45.4646, longitude: 9.1901 }])).toBe(true);
    expect(isAlreadySaved(p, [{ name: 'Pizzeria Da Gino', latitude: 41.9, longitude: 12.5 }])).toBe(false);
  });
});
