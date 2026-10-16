// Ricerca e filtri della Libreria: tutto sul telefono, senza chiamate al server
// (una libreria personale ha al massimo qualche centinaio di elementi).

/** "Crème Brûlée " → "creme brulee" */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Vero se ogni parola cercata compare in almeno uno dei campi ("pasta zucc" trova "Pasta con zucchine"). */
export function matchesQuery(fields: (string | null | undefined)[], query: string): boolean {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const haystack = normalize(fields.filter(Boolean).join(' · '));
  return words.every((w) => haystack.includes(w));
}

export type LibraryRecipe = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  total_minutes: number | null;
  tags: string[];
  kcal_per_serving: number | null;
  difficulty: string | null;
  created_at: string;
  recipe_ingredients: { name: string }[];
};

export type LibraryPlace = {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  cuisine: string | null;
  price_level: number | null;
  recommended_dishes: string[];
  image_url: string | null;
  wishlist: boolean;
  verified: boolean;
  created_at: string;
};

/** Gli id dentro una collezione (null = nessuna collezione scelta). */
export type CollectionScope = { recipeIds: string[]; placeIds: string[] } | null;

export type RecipeFilters = { query: string; tags: string[]; collection: CollectionScope };
export type PlaceFilters = { query: string; wishlistOnly: boolean; city: string | null; collection: CollectionScope };

/** Ricette che corrispondono a ricerca (titolo, descrizione, etichette, ingredienti), etichette scelte (tutte) e collezione. */
export function filterRecipes<T extends LibraryRecipe>(recipes: T[], f: RecipeFilters): T[] {
  const inCollection = f.collection ? new Set(f.collection.recipeIds) : null;
  return recipes.filter(
    (r) =>
      (!inCollection || inCollection.has(r.id)) &&
      f.tags.every((tag) => r.tags.includes(tag)) &&
      matchesQuery([r.title, r.description, ...r.tags, ...r.recipe_ingredients.map((i) => i.name)], f.query),
  );
}

/** Posti che corrispondono a ricerca (nome, città, indirizzo, cucina, piatti), città, "voglio andarci" e collezione. */
export function filterPlaces<T extends LibraryPlace>(places: T[], f: PlaceFilters): T[] {
  const inCollection = f.collection ? new Set(f.collection.placeIds) : null;
  const city = f.city ? normalize(f.city) : null;
  return places.filter(
    (p) =>
      (!inCollection || inCollection.has(p.id)) &&
      (!f.wishlistOnly || p.wishlist) &&
      (!city || normalize(p.city ?? '') === city) &&
      matchesQuery([p.name, p.city, p.address, p.cuisine, ...p.recommended_dishes], f.query),
  );
}

/** Valori più frequenti prima (a parità, in ordine alfabetico). */
function countValues(values: string[]): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'it'));
}

/** Le etichette usate nelle ricette, per i filtri. */
export function tagCounts(recipes: Pick<LibraryRecipe, 'tags'>[]) {
  return countValues(recipes.flatMap((r) => [...new Set(r.tags)]));
}

/** Le città dei posti salvati ("milano" e "Milano " contano come la stessa). */
export function cityCounts(places: Pick<LibraryPlace, 'city'>[]) {
  const display = new Map<string, string>();
  const keys: string[] = [];
  for (const p of places) {
    const name = p.city?.replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const key = normalize(name);
    if (!display.has(key)) display.set(key, name);
    keys.push(key);
  }
  return countValues(keys).map(({ value, count }) => ({ value: display.get(value)!, count }));
}
