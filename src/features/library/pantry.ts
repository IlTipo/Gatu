// "Cosa cucino con ciò che ho": confronta gli ingredienti che hai con quelli delle ricette.

import { type LibraryRecipe, normalize } from './filter';

// Cose che quasi tutti hanno in casa: non contano come "mancanti".
const STAPLES = ['sale', 'pepe', 'olio', 'acqua', 'aceto'];

// Nomi generici che coprono quelli specifici (se scrivi "pasta" valgono gli spaghetti).
export const FAMILIES: Record<string, string[]> = {
  pasta: ['spaghetti', 'penne', 'fusilli', 'rigatoni', 'linguine', 'tagliatelle', 'farfalle', 'orecchiette', 'paccheri', 'mezze maniche', 'bucatini', 'trofie', 'lasagne', 'gnocchi'],
  formaggio: ['parmigiano', 'grana', 'pecorino', 'mozzarella', 'scamorza', 'provola', 'gorgonzola', 'ricotta', 'stracchino', 'fontina', 'burrata', 'feta', 'emmental'],
  uova: ['tuorli', 'tuorlo', 'albumi', 'albume'],
  carne: ['manzo', 'maiale', 'vitello', 'agnello', 'salsiccia', 'macinato', 'guanciale', 'pancetta', 'prosciutto'],
  pesce: ['salmone', 'tonno', 'merluzzo', 'orata', 'branzino', 'baccala', 'gamberi', 'cozze', 'vongole', 'calamari', 'polpo', 'acciughe', 'alici'],
};

/** "zucchine" → "zucchin": così zucchina/zucchine, uovo/uova coincidono. */
export function stem(word: string): string {
  return word.length > 3 ? word.replace(/[aeiou]$/, '') : word;
}

function words(text: string): string[] {
  return normalize(text)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1)
    .map(stem);
}

/** Vero se l'ingrediente "name" è coperto da ciò che hai ("have" già normalizzato in parole). */
function covers(have: string, ingredient: string): boolean {
  const need = words(ingredient);
  const mine = words(have);
  if (mine.length && mine.every((w) => need.some((n) => n.startsWith(w)))) return true;
  const family = FAMILIES[normalize(have)];
  return !!family?.some((specific) => words(specific).every((w) => need.some((n) => n.startsWith(w))));
}

export function isStaple(ingredient: string): boolean {
  const first = words(ingredient)[0];
  return !!first && STAPLES.some((s) => stem(s) === first);
}

export type PantryMatch<T> = { recipe: T; have: string[]; missing: string[] };

/**
 * Ricette che puoi fare con ciò che hai, prima quelle a cui manca meno.
 * Mostra solo ricette con almeno un ingrediente che hai.
 */
export function matchPantry<T extends Pick<LibraryRecipe, 'recipe_ingredients'>>(recipes: T[], pantry: string[]): PantryMatch<T>[] {
  const items = pantry.map((p) => p.trim()).filter(Boolean);
  if (!items.length) return [];
  return recipes
    .map((recipe) => {
      const needed = [...new Set(recipe.recipe_ingredients.map((i) => i.name.trim()).filter((n) => n && !isStaple(n)))];
      const have = needed.filter((n) => items.some((p) => covers(p, n)));
      return { recipe, have, missing: needed.filter((n) => !have.includes(n)) };
    })
    .filter((m) => m.have.length > 0)
    .sort((a, b) => a.missing.length - b.missing.length || b.have.length - a.have.length);
}

/** "uova, zucchine e parmigiano" → ["uova", "zucchine", "parmigiano"] */
export function splitPantryInput(text: string): string[] {
  return text
    .split(/,|;|\n|\se\s/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Un elemento a caso, diverso dal precedente quando possibile. */
export function pickRandom<T extends { id: string }>(list: T[], previousId: string | null, random = Math.random): T | null {
  if (!list.length) return null;
  const pool = list.length > 1 && previousId ? list.filter((x) => x.id !== previousId) : list;
  return pool[Math.floor(random() * pool.length)] ?? pool[0];
}
