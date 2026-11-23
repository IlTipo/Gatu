// Prova a mano con l'AI vera: quanto ci mette Morso a inventare (e modificare) una ricetta.
import { createGeminiRecipeTools } from '../_shared/gemini.ts';

const tools = createGeminiRecipeTools(Deno.env.get('GEMINI_API_KEY')!, {});
const request = {
  ingredients: ['petto di pollo', 'zucchine', 'patate', 'yogurt greco', 'limone', 'pane'],
  servings: 2,
  maxMinutes: null,
  avoid: [] as string[],
  tools: ['friggitrice ad aria' as const],
  prefs: ['leggera'],
};
for (let i = 1; i <= 3; i++) {
  const t0 = Date.now();
  const out = await tools.fridgeRecipe(request);
  const s = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(out.ok ? `ricetta #${i}: ${s}s · ${out.model} · "${out.recipe.title}" (${out.recipe.steps.length} passaggi)` : `ricetta #${i}: ${s}s · errore ${out.reason}`);
  if (out.ok && i === 1) {
    const t1 = Date.now();
    const refined = await tools.fridgeRefine({ recipe: out.recipe, instruction: 'per 4 persone e senza yogurt', history: [], request });
    const s2 = ((Date.now() - t1) / 1000).toFixed(1);
    console.log(refined.ok ? `modifica: ${s2}s · ${refined.model} · "${refined.recipe.title}" · ${refined.recipe.reply}` : `modifica: ${s2}s · errore ${refined.reason}`);
  }
}

// ogni modello di riserva risponde davvero?
for (const model of ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3-flash-preview']) {
  const one = createGeminiRecipeTools(Deno.env.get('GEMINI_API_KEY')!, { model, fallbackModels: [] });
  const t0 = Date.now();
  const out = await one.fridgeRecipe(request);
  console.log(`${model}: ${((Date.now() - t0) / 1000).toFixed(1)}s · ${out.ok ? `${out.model} · "${out.recipe.title}"` : `errore ${out.reason}`}`);
}
