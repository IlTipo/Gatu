import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import { applyDoseEstimate, buildDoseMessage, type DoseInput, isToTaste, needsDoseEstimate } from '../_shared/doses.ts';

const input: DoseInput = {
  title: 'Pasta alla Norma',
  servings: null,
  ingredients: [
    { quantity: 320, unit: 'g', name: 'rigatoni', note: null, estimated: false },
    { quantity: null, unit: null, name: 'melanzane', note: null, estimated: false },
    { quantity: null, unit: null, name: 'passata di pomodoro', note: null, estimated: false },
    { quantity: null, unit: null, name: 'sale', note: 'q.b.', estimated: false },
  ],
  steps: ['Friggi le melanzane.', 'Cuoci la pasta.'],
};

Deno.test('q.b. non conta come dose mancante', () => {
  assert(isToTaste({ note: 'q.b.' }));
  assert(isToTaste({ note: 'a piacere' }));
  assertEquals(isToTaste({ note: null }), false);
  assertEquals(needsDoseEstimate({ servings: 2, ingredients: [input.ingredients[0], input.ingredients[3]] }), false);
  assert(needsDoseEstimate({ servings: 2, ingredients: input.ingredients }));
  assert(needsDoseEstimate({ servings: null, ingredients: [input.ingredients[0]] })); // mancano le porzioni
});

Deno.test("messaggio per l'AI: indica cosa manca, con gli indici", () => {
  const msg = buildDoseMessage(input);
  assertStringIncludes(msg, '0. rigatoni — 320 g');
  assertStringIncludes(msg, '1. melanzane — DOSE MANCANTE');
  assertStringIncludes(msg, '3. sale — DOSE MANCANTE (q.b.)');
  assertStringIncludes(msg, '<porzioni>non indicate</porzioni>');
});

Deno.test('applica solo le stime valide, segnandole come stimate', () => {
  const merged = applyDoseEstimate(input, {
    servings: 4,
    ingredients: [
      { index: 1, quantity: 2, unit: null }, // melanzane: ok
      { index: 2, quantity: 400.123, unit: 'ml' }, // passata: ok, arrotondata
      { index: 0, quantity: 999, unit: 'g' }, // rigatoni: aveva già la dose → ignorata
      { index: 3, quantity: 5, unit: 'g' }, // sale q.b. → ignorato
      { index: 9, quantity: 1, unit: null }, // indice inesistente → ignorato
    ],
  });
  assertEquals(merged.changed, 2);
  assertEquals(merged.servings, 4);
  assertEquals(merged.servingsEstimated, true);
  assertEquals(merged.ingredients[0], input.ingredients[0]);
  assertEquals(merged.ingredients[1], { quantity: 2, unit: null, name: 'melanzane', note: null, estimated: true });
  assertEquals(merged.ingredients[2].quantity, 400.12);
  assertEquals(merged.ingredients[2].unit, 'ml');
  assertEquals(merged.ingredients[3].quantity, null);
  assertEquals(input.ingredients[1].quantity, null); // l'originale non viene modificato
});

Deno.test('porzioni già indicate: non cambiano; stime assurde scartate', () => {
  const merged = applyDoseEstimate({ ...input, servings: 2 }, {
    servings: 8,
    ingredients: [{ index: 1, quantity: -3, unit: null }, { index: 2, quantity: null, unit: 'ml' }],
  });
  assertEquals(merged.servings, 2);
  assertEquals(merged.servingsEstimated, false);
  assertEquals(merged.changed, 0);
});
