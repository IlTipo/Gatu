// Procedimento dal video: l'utente carica il video della ricetta (salvato da TikTok, Instagram…)
// nella sua cartella privata "videos/<suo id>/…"; Gemini lo guarda e lo ascolta; il video poi si cancella.
// Qui: controllo del percorso e unione con la ricetta già salvata. Niente rete: testabile.

import type { CleanIngredient, CleanRecipe } from './extraction.ts';

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const VIDEO_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
};
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** "<id utente>/<uuid>.mp4" → tipo del video; null se il percorso non è valido o non è dell'utente. */
export function parseVideoPath(path: unknown, userId: string): { mimeType: string } | null {
  if (typeof path !== 'string') return null;
  const m = path.match(new RegExp(`^(${UUID})/${UUID}\\.([a-z0-9]{3,4})$`));
  if (!m || m[1] !== userId.toLowerCase()) return null;
  const mimeType = VIDEO_TYPES[m[2]];
  return mimeType ? { mimeType } : null;
}

export type SavedRecipe = {
  title: string;
  description: string | null;
  servings: number | null;
  servings_estimated: boolean;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  tags: string[];
  ingredients: CleanIngredient[];
  steps: { text: string; timer_seconds: number | null }[];
};

const missingDoses = (list: CleanIngredient[]) => list.filter((i) => i.quantity === null && i.note !== 'q.b.').length;

/**
 * Unisce ciò che si è capito dal video con la ricetta salvata (stessa ricetta: voti, note,
 * planner e collezioni restano). Il procedimento del video vince; gli ingredienti del video
 * vincono se sono più completi; titolo, descrizione e foto restano quelli salvati.
 */
export function mergeVideoRecipe(saved: SavedRecipe, video: CleanRecipe): { recipe: SavedRecipe; changed: string[] } {
  const changed: string[] = [];
  const steps = video.steps.length ? video.steps : saved.steps;
  if (video.steps.length) changed.push('steps');

  const videoBetter = video.ingredients.length > 0 &&
    (saved.ingredients.length === 0 ||
      video.ingredients.length > saved.ingredients.length ||
      missingDoses(video.ingredients) < missingDoses(saved.ingredients));
  const ingredients = videoBetter ? video.ingredients : saved.ingredients;
  if (videoBetter) changed.push('ingredients');

  // porzioni: quelle del video se le nostre erano solo stimate (e le dosi vengono dal video)
  const useVideoServings = videoBetter && video.servings !== null &&
    (saved.servings === null || saved.servings_estimated);
  return {
    recipe: {
      ...saved,
      servings: useVideoServings ? video.servings : saved.servings,
      servings_estimated: useVideoServings ? video.servings_estimated : saved.servings_estimated,
      prep_minutes: saved.prep_minutes ?? video.prep_minutes,
      cook_minutes: saved.cook_minutes ?? video.cook_minutes,
      total_minutes: saved.total_minutes ?? video.total_minutes,
      tags: [...new Set([...saved.tags, ...video.tags])].slice(0, 12),
      ingredients,
      steps,
    },
    changed,
  };
}
