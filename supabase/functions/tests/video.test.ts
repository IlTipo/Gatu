import { assertEquals } from 'jsr:@std/assert@1';

import type { CleanRecipe } from '../_shared/extraction.ts';
import { mergeVideoRecipe, parseVideoPath, type SavedRecipe } from '../_shared/video.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const FILE = '33333333-3333-4333-8333-333333333333';

Deno.test('percorso del video: solo nella propria cartella e con estensione video', () => {
  assertEquals(parseVideoPath(`${USER}/${FILE}.mp4`, USER), { mimeType: 'video/mp4' });
  assertEquals(parseVideoPath(`${USER}/${FILE}.mov`, USER), { mimeType: 'video/quicktime' });
  assertEquals(parseVideoPath(`${OTHER}/${FILE}.mp4`, USER), null); // cartella di un altro
  assertEquals(parseVideoPath(`${USER}/../${OTHER}/${FILE}.mp4`, USER), null);
  assertEquals(parseVideoPath(`${USER}/${FILE}.exe`, USER), null);
  assertEquals(parseVideoPath(`${USER}/nome.mp4`, USER), null);
  assertEquals(parseVideoPath(42, USER), null);
});

const ing = (name: string, quantity: number | null, note: string | null = null) => ({
  quantity,
  unit: quantity === null ? null : 'g',
  name,
  note,
  aisle: 'altro' as const,
  estimated: false,
});

const saved: SavedRecipe = {
  title: 'Pasta cremosa',
  description: 'dal TikTok di @chef',
  servings: 2,
  servings_estimated: true,
  prep_minutes: null,
  cook_minutes: 10,
  total_minutes: null,
  tags: ['primo'],
  ingredients: [ing('pasta', null), ing('panna', null)],
  steps: [],
};

const fromVideo: CleanRecipe = {
  title: 'Pasta cremosa al limone',
  description: null,
  servings: 3,
  servings_estimated: false,
  prep_minutes: 5,
  cook_minutes: 12,
  total_minutes: 17,
  tags: ['veloce'],
  ingredients: [ing('pasta', 300), ing('panna', 200), ing('limone', 1), ing('sale', null, 'q.b.')],
  steps: [{ text: 'Cuoci la pasta.', timer_seconds: 600 }, {
    text: 'Manteca con panna e limone.',
    timer_seconds: null,
  }],
  insights: null,
};

Deno.test("video: procedimento e dosi dal video, il resto resta com'era", () => {
  const { recipe, changed } = mergeVideoRecipe(saved, fromVideo);
  assertEquals(changed, ['steps', 'ingredients']);
  assertEquals(recipe.title, 'Pasta cremosa'); // il titolo salvato resta
  assertEquals(recipe.description, 'dal TikTok di @chef');
  assertEquals(recipe.steps.length, 2);
  assertEquals(recipe.ingredients.map((i) => i.quantity), [300, 200, 1, null]);
  assertEquals([recipe.servings, recipe.servings_estimated], [3, false]); // erano solo stimate
  assertEquals([recipe.prep_minutes, recipe.cook_minutes], [5, 10]); // si riempie solo ciò che manca
  assertEquals(recipe.tags, ['primo', 'veloce']);
});

Deno.test('video senza ingredienti utili: restano quelli salvati', () => {
  const complete = {
    ...saved,
    servings_estimated: false,
    ingredients: [ing('pasta', 200), ing('panna', 100), ing('limone', 1)],
  };
  const { recipe, changed } = mergeVideoRecipe(complete, { ...fromVideo, ingredients: [ing('pasta', null)] });
  assertEquals(changed, ['steps']);
  assertEquals(recipe.ingredients, complete.ingredients);
  assertEquals(recipe.servings, 2);
});

Deno.test('video senza passaggi: il procedimento salvato non si perde', () => {
  const withSteps = { ...saved, steps: [{ text: 'Già scritto.', timer_seconds: null }] };
  const { recipe } = mergeVideoRecipe(withSteps, { ...fromVideo, steps: [] });
  assertEquals(recipe.steps, withSteps.steps);
});
