import { aisleFor, aisleRank, cleanAislePrefs, moveAisleInOrder } from '@/features/shopping/aisles';

describe('reparti della spesa', () => {
  it('ordine salvato completato con i reparti mancanti, senza doppioni né reparti inventati', () => {
    const p = cleanAislePrefs({ order: ['bevande', 'bevande', 'pizzeria'], overrides: { tofu: 'latticini', x: 'boh' } });
    expect(p.order[0]).toBe('bevande');
    expect(p.order).toHaveLength(8);
    expect(p.overrides).toEqual({ tofu: 'latticini' });
  });
  it('sposta su e giù senza uscire dai bordi', () => {
    expect(moveAisleInOrder(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveAisleInOrder(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveAisleInOrder(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
  });
  it('il reparto scelto vince su quello proposto (anche al plurale)', () => {
    const prefs = cleanAislePrefs({ overrides: { zucchin: 'surgelati' } });
    expect(aisleFor('Zucchine', 'frutta_verdura', prefs)).toBe('surgelati');
    expect(aisleFor('zucchina', 'frutta_verdura', prefs)).toBe('surgelati');
    expect(aisleFor('Pane', 'panetteria', prefs)).toBe('panetteria');
    expect(aisleRank('altro', ['altro', 'bevande'])).toBe(0);
    expect(aisleRank('nuovo', ['altro'])).toBe(1);
  });
});
