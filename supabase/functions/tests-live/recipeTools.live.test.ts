// Test "dal vivo" degli strumenti sulla ricetta: valori/difficoltà/costo e varianti.
//   GEMINI_API_KEY=... npm run test:ai-live
import { assert, assertEquals } from 'jsr:@std/assert@1';

import { createGeminiRecipeTools } from '../_shared/gemini.ts';
import { cleanInsights, cleanVariant, type RecipeForAi } from '../_shared/recipeTools.ts';

const apiKey = Deno.env.get('GEMINI_API_KEY');
const tools = apiKey ? createGeminiRecipeTools(apiKey, { model: Deno.env.get('GEMINI_MODEL') }) : null;

const carbonara: RecipeForAi = {
  title: 'Spaghetti alla carbonara',
  servings: 4,
  tags: ['primo', 'carne'],
  ingredients: [
    { quantity: 320, unit: 'g', name: 'spaghetti', note: null },
    { quantity: 150, unit: 'g', name: 'guanciale', note: null },
    { quantity: 4, unit: null, name: 'tuorli', note: null },
    { quantity: 50, unit: 'g', name: 'pecorino romano', note: null },
    { quantity: null, unit: null, name: 'pepe nero', note: 'q.b.' },
  ],
  steps: [
    { text: 'Rosola il guanciale a listarelle finché è croccante.', timer_seconds: 480 },
    { text: 'Sbatti i tuorli con il pecorino e molto pepe.', timer_seconds: null },
    { text: 'Cuoci la pasta, scolala e mantecala fuori dal fuoco con uova e guanciale.', timer_seconds: 600 },
  ],
};

Deno.test({ name: 'calorie, difficoltà e costo della carbonara', ignore: !tools }, async () => {
  const outcome = await tools!.insights(carbonara);
  assert(outcome.ok, `chiamata fallita: ${JSON.stringify(outcome)}`);
  const i = cleanInsights(outcome.insights);
  console.log(' ', JSON.stringify(i));
  assert(i?.kcal_per_serving && i.kcal_per_serving > 350 && i.kcal_per_serving < 1200, 'kcal plausibili');
  assert(i.difficulty !== null, 'difficoltà');
  assert(i.cost_level !== null, 'costo');
});

Deno.test({ name: 'variante vegetariana della carbonara: niente guanciale', ignore: !tools }, async () => {
  const outcome = await tools!.variant(carbonara, 'vegetariana');
  assert(outcome.ok, `chiamata fallita: ${JSON.stringify(outcome)}`);
  const v = cleanVariant(outcome.variant, 'vegetariana', carbonara);
  console.log(' ', v?.title, '·', v?.changes.join(' | '));
  assert(v, 'variante valida');
  assert(!v.ingredients.some((i) => /guanciale|pancetta/i.test(i.name)), 'ancora carne negli ingredienti');
  assert(v.changes.length > 0, 'elenco delle modifiche');
  assertEquals(v.tags.includes('carne'), false);
});
