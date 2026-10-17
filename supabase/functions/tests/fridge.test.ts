import { assert, assertEquals } from 'jsr:@std/assert@1';

import { buildFridgeMessage, cleanFridgeRecipe, cleanFridgeScan, parseFridgeRequest } from '../_shared/fridge.ts';

Deno.test('richiesta dal sito: pulita e limitata', () => {
  const r = parseFridgeRequest({
    ingredients: ['uova', 'x'.repeat(100), 3, 'uova'],
    servings: 99,
    maxMinutes: 30,
    avoid: 'no',
  });
  assertEquals(r!.ingredients.length, 2);
  assertEquals(r!.ingredients[1].length, 60);
  assertEquals([r!.servings, r!.maxMinutes, r!.avoid], [null, 30, []]);
  assertEquals(
    parseFridgeRequest({ ingredients: Array.from({ length: 80 }, (_, i) => `cibo ${i}`) })!.ingredients.length,
    40,
  );
  assertEquals(parseFridgeRequest({}), null);
});

Deno.test("messaggio per l'AI: dati dentro tag", () => {
  const msg = buildFridgeMessage({
    ingredients: ['uova', 'zucchine'],
    servings: 2,
    maxMinutes: null,
    avoid: ['Frittata'],
  });
  assertEquals(msg, '<ingredienti>uova, zucchine</ingredienti>\n<persone>2</persone>\n<evita>Frittata</evita>');
});

Deno.test('foto del frigo: nomi puliti', () => {
  assertEquals(cleanFridgeScan({ ingredients: [' Latte ', 'latte', '', 'Yogurt!'] }), ['latte', 'yogurt']);
});

Deno.test('ricetta senza passaggi o ingredienti → scartata', () => {
  const base = {
    title: 'X',
    tags: [],
    uses: [],
    missing: [],
    ingredients: [{ name: 'uova', quantity: 2 }],
    steps: [{ text: 'Cuoci.' }],
  };
  const req = { ingredients: ['uova'], servings: 3, maxMinutes: null, avoid: [] };
  assert(cleanFridgeRecipe(base, req));
  assertEquals(cleanFridgeRecipe({ ...base, steps: [] }, req), null);
  assertEquals(cleanFridgeRecipe({ ...base, ingredients: [] }, req), null);
  assertEquals(cleanFridgeRecipe(base, req)!.servings, 3); // persone chieste, se l'AI non le dice
});
