import { googleMapsUrl, parseDishes, priceLabel } from '@/features/places/format';
import {
  formatIngredient,
  formatMinutes,
  formatQuantity,
  hasMissingDoses,
  parseNumber,
  scaleQuantity,
} from '@/features/recipes/format';

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

describe('dosi per un altro numero di persone', () => {
  it('grammi e millilitri con arrotondamenti da cucina', () => {
    expect(scaleQuantity(320, 'g', 1 / 4)).toBe(80); // 320 g per 4 → 80 g a testa
    expect(scaleQuantity(200, 'g', 2 / 3)).toBe(130); // 133,3 → 130 (sopra i 100 g, alla decina)
    expect(scaleQuantity(100, 'g', 2 / 3)).toBe(65); // 66,7 → 65 (sotto i 100 g, ai 5 g)
    expect(scaleQuantity(500, 'ml', 6 / 4)).toBe(750);
    expect(scaleQuantity(5, 'g', 1 / 4)).toBe(1); // mai zero
    expect(scaleQuantity(1234, 'g', 1)).toBe(1234); // stesso numero di persone: invariato
  });

  it('pezzi e cucchiai al mezzo più vicino, minimo mezzo', () => {
    expect(scaleQuantity(4, null, 1 / 4)).toBe(1); // 4 uova per 4 → 1 a testa
    expect(scaleQuantity(3, null, 1 / 4)).toBe(1); // 0,75 → 1
    expect(scaleQuantity(1, null, 1 / 6)).toBe(0.5);
    expect(scaleQuantity(2, 'cucchiaio', 5 / 2)).toBe(5);
  });

  it('chili e litri, pizzichi e q.b.', () => {
    expect(scaleQuantity(1, 'kg', 1 / 3)).toBe(0.35);
    expect(scaleQuantity(1, 'pizzico', 3)).toBe(1);
    expect(scaleQuantity(null, null, 2)).toBeNull();
  });

  it('unità al plurale', () => {
    expect(formatIngredient({ quantity: 2, unit: 'spicchio', name: 'aglio', note: null })).toBe('2 spicchi aglio');
    expect(formatIngredient({ quantity: 0.5, unit: 'spicchio', name: 'aglio', note: null })).toBe('0,5 spicchio aglio');
    expect(formatIngredient({ quantity: 3, unit: 'g', name: 'sale', note: null })).toBe('3 g sale');
  });

  it('dose stimata con "~"', () => {
    expect(formatIngredient({ quantity: 2, unit: null, name: 'zucchine', note: null, estimated: true })).toBe('~2 zucchine');
    expect(formatIngredient({ quantity: null, unit: null, name: 'sale', note: 'q.b.', estimated: true })).toBe('sale (q.b.)');
  });

  it('dosi mancanti', () => {
    expect(hasMissingDoses(2, [{ quantity: 100, note: null }, { quantity: null, note: 'q.b.' }])).toBe(false);
    expect(hasMissingDoses(2, [{ quantity: null, note: null }])).toBe(true);
    expect(hasMissingDoses(null, [{ quantity: 100, note: null }])).toBe(true);
  });
});
