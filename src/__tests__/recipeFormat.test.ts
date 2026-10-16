import { googleMapsUrl, parseDishes, priceLabel } from '@/features/places/format';
import { formatIngredient, formatMinutes, formatQuantity, parseNumber } from '@/features/recipes/format';

describe('formati delle ricette', () => {
  it('quantità in formato italiano', () => {
    expect(formatQuantity(200)).toBe('200');
    expect(formatQuantity(0.5)).toBe('0,5');
    expect(formatQuantity(1.3333)).toBe('1,33');
    expect(formatQuantity(null)).toBe('');
  });

  it('riga ingrediente', () => {
    expect(formatIngredient({ quantity: 200, unit: 'g', name: 'spaghetti', note: null })).toBe('200 g spaghetti');
    expect(formatIngredient({ quantity: 1, unit: null, name: 'limone', note: null })).toBe('1 limone');
    expect(formatIngredient({ quantity: null, unit: null, name: 'sale', note: 'q.b.' })).toBe('sale (q.b.)');
  });

  it('minuti leggibili', () => {
    expect(formatMinutes(20)).toBe('20 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(95)).toBe('1 h 35 min');
    expect(formatMinutes(0)).toBeNull();
    expect(formatMinutes(null)).toBeNull();
  });

  it('legge i numeri scritti a mano', () => {
    expect(parseNumber('0,5')).toBe(0.5);
    expect(parseNumber(' 12 ')).toBe(12);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('-3')).toBeNull();
  });
});

describe('formati dei locali', () => {
  it('fascia di prezzo', () => {
    expect(priceLabel(2)).toBe('€€');
    expect(priceLabel(null)).toBeNull();
  });

  it('link Google Maps', () => {
    expect(googleMapsUrl({ name: 'Trattoria Anna Maria', city: 'Bologna', address: null, google_place_id: null })).toBe(
      'https://www.google.com/maps/search/?api=1&query=Trattoria%20Anna%20Maria%2C%20Bologna',
    );
    expect(googleMapsUrl({ name: 'X', city: null, address: 'Via Roma 1', google_place_id: 'ChIJ1' })).toContain('&query_place_id=ChIJ1');
  });

  it('piatti separati da virgole', () => {
    expect(parseDishes('trofie al pesto, focaccia,\n focaccia , ')).toEqual(['trofie al pesto', 'focaccia']);
  });
});
