import { assert, assertEquals } from 'jsr:@std/assert@1';

import { AskSchema, buildAskMessage, buildCatalog, cleanAnswer } from '../_shared/ask.ts';

const recipe = (id: string, title: string) => ({
  id,
  title,
  tags: ['veloce'],
  total_minutes: 15,
  kcal_per_serving: null,
  difficulty: null,
  recipe_ingredients: [{ name: 'uova' }, { name: 'zucchine' }],
});

Deno.test('catalogo: sigle brevi, una riga per elemento, niente "|" nei testi', () => {
  const { text, refs } = buildCatalog([recipe('a', 'Frittata | veloce'), recipe('b', 'Pasta')], [
    {
      id: 'c',
      name: 'Bar Roma',
      city: 'Roma',
      cuisine: null,
      price_level: 1,
      recommended_dishes: ['cornetto'],
      wishlist: false,
    },
  ]);
  const lines = text.split('\n');
  assertEquals(lines.length, 3);
  assert(lines[0].startsWith('R1 | Frittata veloce | etichette: veloce | 15 min | ingredienti: uova, zucchine'));
  assertEquals(lines[2], 'P1 | Bar Roma | città: Roma | prezzo: € | piatti: cornetto');
  assertEquals(refs.get('R2'), { type: 'recipe', id: 'b' });
  assertEquals(refs.get('P1'), { type: 'place', id: 'c' });
});

Deno.test('risposta pulita: sigle sconosciute e doppioni scartati, massimo 8', () => {
  const { refs } = buildCatalog(Array.from({ length: 12 }, (_, n) => recipe(`id${n}`, `Ricetta ${n}`)), []);
  const raw = AskSchema.parse({
    message: '  Ecco  ',
    items: [
      { ref: 'r1', reason: 'ok' },
      { ref: 'R1' },
      { ref: 'X9' },
      ...Array.from({ length: 10 }, (_, n) => ({ ref: `R${n + 2}` })),
    ],
  });
  const clean = cleanAnswer(raw, refs);
  assertEquals(clean.message, 'Ecco');
  assertEquals(clean.items.length, 8);
  assertEquals(clean.items[0], { type: 'recipe', id: 'id0', reason: 'ok' });
  assertEquals(clean.items[1].reason, null);
});

Deno.test('domanda dentro tag e accorciata', () => {
  const msg = buildAskMessage('x'.repeat(500), 'R1 | Pasta');
  assert(msg.includes('<libreria>\nR1 | Pasta\n</libreria>'));
  assertEquals(msg.match(/<domanda>(x+)<\/domanda>/)![1].length, 300);
});
