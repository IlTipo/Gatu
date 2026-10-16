import { pickLanguage } from '@/i18n/languages';
import italian from '@/i18n/locales/it.json';

describe('i18n', () => {
  it("usa l'italiano come lingua di riserva", () => {
    expect(pickLanguage(['de', 'fr'])).toBe('it');
    expect(pickLanguage([null, undefined])).toBe('it');
  });

  it('sceglie una lingua supportata', () => {
    expect(pickLanguage(['de', 'it'])).toBe('it');
  });

  it('nessun testo italiano è vuoto', () => {
    const empty: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (typeof node === 'string') {
        if (!node.trim()) empty.push(path);
      } else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
      }
    };
    walk(italian, '');
    expect(empty).toEqual([]);
  });
});
