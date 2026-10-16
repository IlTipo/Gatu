// Collezioni automatiche: si riempiono da sole con delle regole semplici.
// Le regole stanno nel database (collections.rules) e le applica l'app.

import { type LibraryPlace, type LibraryRecipe, normalize } from '@/features/library/filter';

export type CollectionRules = {
  /** ricette con TUTTE queste etichette */
  tags?: string[];
  max_minutes?: number | null;
  max_kcal?: number | null;
  difficulty?: 'facile' | 'media' | 'difficile' | null;
  /** posti in questa città */
  city?: string | null;
  /** solo posti nella lista "Voglio andarci" */
  wishlist?: boolean;
};

export const MINUTE_CHOICES = [15, 30, 60];
export const KCAL_CHOICES = [400, 600, 800];

export function hasRecipeRules(r: CollectionRules): boolean {
  return !!(r.tags?.length || r.max_minutes || r.max_kcal || r.difficulty);
}

export function hasPlaceRules(r: CollectionRules): boolean {
  return !!(r.city?.trim() || r.wishlist);
}

/** Toglie i valori vuoti; null se non resta nessuna regola. */
export function cleanRules(r: CollectionRules): CollectionRules | null {
  const out: CollectionRules = {};
  if (r.tags?.length) out.tags = [...new Set(r.tags)].slice(0, 10);
  if (r.max_minutes && r.max_minutes > 0) out.max_minutes = r.max_minutes;
  if (r.max_kcal && r.max_kcal > 0) out.max_kcal = r.max_kcal;
  if (r.difficulty) out.difficulty = r.difficulty;
  if (r.city?.trim()) out.city = r.city.trim().slice(0, 60);
  if (r.wishlist) out.wishlist = true;
  return hasRecipeRules(out) || hasPlaceRules(out) ? out : null;
}

/** Le ricette e i posti che rispettano le regole (le ricette senza dato richiesto non entrano). */
export function applyRules(
  rules: CollectionRules,
  recipes: Pick<LibraryRecipe, 'id' | 'tags' | 'total_minutes' | 'kcal_per_serving' | 'difficulty'>[],
  places: Pick<LibraryPlace, 'id' | 'city' | 'wishlist'>[],
): { recipeIds: string[]; placeIds: string[] } {
  const recipeIds = hasRecipeRules(rules)
    ? recipes
        .filter(
          (r) =>
            (rules.tags ?? []).every((t) => r.tags.includes(t)) &&
            (!rules.max_minutes || (r.total_minutes !== null && r.total_minutes <= rules.max_minutes)) &&
            (!rules.max_kcal || (r.kcal_per_serving !== null && r.kcal_per_serving <= rules.max_kcal)) &&
            (!rules.difficulty || r.difficulty === rules.difficulty),
        )
        .map((r) => r.id)
    : [];
  const city = rules.city ? normalize(rules.city) : null;
  const placeIds = hasPlaceRules(rules)
    ? places.filter((p) => (!city || normalize(p.city ?? '') === city) && (!rules.wishlist || p.wishlist)).map((p) => p.id)
    : [];
  return { recipeIds, placeIds };
}

/** Riassunto in italiano: "vegetariano · ≤ 30 min · ≤ 600 kcal". */
export function describeRules(r: CollectionRules): string {
  return [
    ...(r.tags ?? []),
    r.max_minutes ? `≤ ${r.max_minutes} min` : null,
    r.max_kcal ? `≤ ${r.max_kcal} kcal` : null,
    r.difficulty,
    r.city ? `📍 ${r.city}` : null,
    r.wishlist ? '❤️' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
