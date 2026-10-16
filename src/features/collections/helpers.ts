import { applyRules } from './rules';
import type { Collection, CollectionTarget } from './types';

export type CollectionRow = Omit<Collection, 'recipeIds' | 'placeIds'>;
export type ItemRow = { collection_id: string; recipe_id: string | null; place_id: string | null };

/** Unisce collezioni ed elementi (due richieste semplici, niente join). */
export function groupCollections(rows: CollectionRow[], items: ItemRow[]): Collection[] {
  return rows.map((c) => ({
    ...c,
    recipeIds: items.filter((i) => i.collection_id === c.id && i.recipe_id).map((i) => i.recipe_id!),
    placeIds: items.filter((i) => i.collection_id === c.id && i.place_id).map((i) => i.place_id!),
  }));
}

/** Cosa contiene una collezione: gli elementi scelti, oppure (se automatica) quelli che rispettano le regole. */
export function resolveCollection(
  c: Collection,
  recipes: Parameters<typeof applyRules>[1],
  places: Parameters<typeof applyRules>[2],
): { recipeIds: string[]; placeIds: string[] } {
  return c.rules ? applyRules(c.rules, recipes, places) : { recipeIds: c.recipeIds, placeIds: c.placeIds };
}

/** In quali collezioni (scelte a mano) si trova un elemento. */
export function collectionsContaining(collections: Collection[], target: CollectionTarget): Collection[] {
  return collections.filter((c) =>
    !c.rules &&
    ('recipeId' in target ? c.recipeIds.includes(target.recipeId) : c.placeIds.includes(target.placeId)),
  );
}
