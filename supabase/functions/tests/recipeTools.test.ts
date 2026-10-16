import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import { cleanInsights } from '../_shared/insights.ts';
import { insightsFromNutrition } from '../_shared/jsonld.ts';
import { cleanVariant, isVariantKind, recipeAsText, type RecipeForAi } from '../_shared/recipeTools.ts';

const carbonara: RecipeForAi = {
  title: 'Carbonara',
  servings: 4,
  tags: ['primo', 'carne'],
  ingredients: [
    { quantity: 320, unit: 'g', name: 'spaghetti', note: null },
    { quantity: 150, unit: 'g', name: 'guanciale', note: null },
    { quantity: null, unit: null, name: 'pepe', note: 'q.b.' },
  ],
  steps: [{ text: 'Rosola il guanciale.', timer_seconds: null }],
};

Deno.test("ricetta come testo per l'AI", () => {
  const text = recipeAsText(carbonara);
  assertStringIncludes(text, '<ricetta>');
  assertStringIncludes(text, '- 320 g spaghetti');
  assertStringIncludes(text, '- pepe (q.b.)');
  assertStringIncludes(text, '1. Rosola il guanciale.');
});

Deno.test('valori nutrizionali: puliti e nei limiti', () => {
  assertEquals(
    cleanInsights({
      kcal_per_serving: 612.4,
      protein_g: 24.26,
      carbs_g: 70,
      fat_g: 25,
      difficulty: 'Facile',
      cost_level: 2,
    }),
    { kcal_per_serving: 612, protein_g: 24.3, carbs_g: 70, fat_g: 25, difficulty: 'facile', cost_level: 2 },
  );
  assertEquals(cleanInsights({ kcal_per_serving: -5, difficulty: 'impossibile', cost_level: 9 }), null);
  assertEquals(cleanInsights(null), null);
});

Deno.test('valori dalla scheda del sito (schema.org)', () => {
  assertEquals(insightsFromNutrition({ calories: '450 kcal', proteinContent: '18,5 g', fatContent: '12 g' }), {
    kcal_per_serving: 450,
    protein_g: 18.5,
    carbs_g: null,
    fat_g: 12,
    difficulty: null,
    cost_level: null,
  });
  assertEquals(insightsFromNutrition({ proteinContent: '10 g' }), null); // senza calorie non serve
  assertEquals(insightsFromNutrition(undefined), null);
});

Deno.test('variante: pulita, con etichette giuste', () => {
  assert(isVariantKind('vegana'));
  assertEquals(isVariantKind('marziana'), false);
  const v = cleanVariant(
    {
      title: 'Carbonara vegana',
      changes: ['guanciale → tofu affumicato', 'uova → crema di anacardi', '  '],
      servings: 4,
      prep_minutes: 10,
      cook_minutes: 12,
      ingredients: [
        { quantity: 320, unit: 'g', name: 'spaghetti', note: null, aisle: 'dispensa' },
        { quantity: 200, unit: 'g', name: 'tofu affumicato', note: null, aisle: 'Reparto strano' },
        { quantity: null, unit: null, name: '', note: null, aisle: 'altro' },
      ],
      steps: [{ text: 'Rosola il tofu.', timer_seconds: 300 }],
    },
    'vegana',
    carbonara,
  )!;
  assertEquals(v.title, 'Carbonara vegana');
  assertEquals(v.changes.length, 2);
  assertEquals(v.ingredients.length, 2);
  assertEquals(v.ingredients[1].aisle, 'altro');
  assertEquals(v.total_minutes, 22);
  assert(v.tags.includes('vegano') && v.tags.includes('vegetariano') && v.tags.includes('primo'));
  assertEquals(v.tags.includes('carne'), false);
});

Deno.test('variante senza ingredienti → scartata', () => {
  assertEquals(cleanVariant({ title: 'X', changes: [], ingredients: [], steps: [] }, 'light', carbonara), null);
});
