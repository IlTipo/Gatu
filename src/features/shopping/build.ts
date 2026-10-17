// Lista della spesa: dagli ingredienti delle ricette in programma a una lista unica,
// con le dosi ricalcolate per le persone di ogni pasto e gli ingredienti uguali uniti
// (200 g + 0,3 kg di farina = 500 g). Tutto qui, senza rete: testabile.

import { normalize } from '@/features/library/filter';
import { stem } from '@/features/library/pantry';

export type ShoppingIngredient = { name: string; quantity: number | null; unit: string | null; aisle: string };
export type PlannedRecipe = { id: string; title: string; servings: number | null; ingredients: ShoppingIngredient[] };
export type PlannedMeal = { recipe_id: string; servings: number | null };

export type ShoppingLine = {
  key: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  aisle: string;
  recipe_ids: string[];
};

// Unità della stessa famiglia: si sommano nell'unità base.
const UNIT_BASE: Record<string, { base: string; factor: number }> = {
  g: { base: 'g', factor: 1 },
  gr: { base: 'g', factor: 1 },
  grammi: { base: 'g', factor: 1 },
  kg: { base: 'g', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  cl: { base: 'ml', factor: 10 },
  dl: { base: 'ml', factor: 100 },
  l: { base: 'ml', factor: 1000 },
  litro: { base: 'ml', factor: 1000 },
  litri: { base: 'ml', factor: 1000 },
};

const SINGULAR: Record<string, string> = {
  cucchiai: 'cucchiaio',
  cucchiaini: 'cucchiaino',
  spicchi: 'spicchio',
  fette: 'fetta',
  foglie: 'foglia',
  tazze: 'tazza',
  bicchieri: 'bicchiere',
  pezzi: 'pezzo',
  mazzetti: 'mazzetto',
  rametti: 'rametto',
  bustine: 'bustina',
  vasetti: 'vasetto',
  lattine: 'lattina',
  pizzichi: 'pizzico',
};

/** Unità "pulita" e fattore verso la base: "kg" → g ×1000, "cucchiai" → cucchiaio ×1. */
export function canonicalUnit(unit: string | null): { unit: string | null; factor: number } {
  const u = unit?.trim().toLowerCase().replace(/\.$/, '') || null;
  if (!u) return { unit: null, factor: 1 };
  const base = UNIT_BASE[u];
  if (base) return { unit: base.base, factor: base.factor };
  return { unit: SINGULAR[u] ?? u, factor: 1 };
}

/** Chiave per riconoscere lo stesso ingrediente: "Zucchine " e "zucchina" coincidono. */
export function ingredientKey(name: string): string {
  return normalize(name)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(stem)
    .join(' ');
}

// cose che si comprano intere: 1,5 mazzetti → 2
const WHOLE_UNITS = new Set(['pezzo', 'spicchio', 'mazzetto', 'rametto', 'bustina', 'vasetto', 'lattina', 'confezione', 'fetta', 'foglia']);

/** Arrotondamenti da spesa: grammi e ml a 5/10, pezzi sempre interi per eccesso (2,5 uova → 3). */
export function roundForShopping(quantity: number, unit: string | null): number {
  if (unit === 'g' || unit === 'ml') {
    if (quantity < 10) return Math.max(1, Math.round(quantity));
    if (quantity < 100) return Math.round(quantity / 5) * 5;
    return Math.round(quantity / 10) * 10;
  }
  if (!unit || WHOLE_UNITS.has(unit)) return Math.ceil(quantity - 0.001);
  return Math.round(quantity * 4) / 4; // cucchiai ecc.: al quarto
}

/** Mostra 1500 g come 1,5 kg e 1200 ml come 1,2 l. */
export function displayAmount(quantity: number | null, unit: string | null): { quantity: number | null; unit: string | null } {
  if (quantity === null) return { quantity, unit };
  if (unit === 'g' && quantity >= 1000) return { quantity: Math.round(quantity / 100) / 10, unit: 'kg' };
  if (unit === 'ml' && quantity >= 1000) return { quantity: Math.round(quantity / 100) / 10, unit: 'l' };
  return { quantity, unit };
}

/** La lista unita, ordinata per reparto e nome. */
export function buildShoppingList(meals: PlannedMeal[], recipes: PlannedRecipe[]): ShoppingLine[] {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const lines = new Map<string, ShoppingLine>();

  for (const meal of meals) {
    const recipe = byId.get(meal.recipe_id);
    if (!recipe) continue;
    const people = meal.servings ?? recipe.servings ?? 2;
    const factor = recipe.servings ? people / recipe.servings : 1;
    for (const ing of recipe.ingredients) {
      const name = ing.name.replace(/\s+/g, ' ').trim();
      if (!name) continue;
      const { unit, factor: toBase } = canonicalUnit(ing.unit);
      // senza quantità ("sale q.b.") si elenca una volta sola, senza dose
      const amount = ing.quantity === null ? null : ing.quantity * toBase * factor;
      const key = `${ingredientKey(name)}|${amount === null ? 'qb' : (unit ?? '')}`;
      const line = lines.get(key);
      if (line) {
        if (amount !== null) line.quantity = (line.quantity ?? 0) + amount;
        if (!line.recipe_ids.includes(recipe.id)) line.recipe_ids.push(recipe.id);
      } else {
        lines.set(key, { key, name, quantity: amount, unit: amount === null ? null : unit, aisle: ing.aisle || 'altro', recipe_ids: [recipe.id] });
      }
    }
  }

  // se c'è anche una dose, la riga "q.b." dello stesso ingrediente non serve
  const withAmount = new Set([...lines.values()].filter((l) => l.quantity !== null).map((l) => ingredientKey(l.name)));
  return [...lines.values()]
    .filter((l) => l.quantity !== null || !withAmount.has(ingredientKey(l.name)))
    .map((l) => ({ ...l, quantity: l.quantity === null ? null : roundForShopping(l.quantity, l.unit) }))
    .sort((a, b) => a.aisle.localeCompare(b.aisle) || a.name.localeCompare(b.name, 'it'));
}

// Reparto per le cose aggiunte a mano (stesse parole chiave del server).
const AISLE_WORDS: [string, RegExp][] = [
  ['surgelati', /surgelat/i],
  ['latticini', /latte|burro|panna|formagg|parmigian|pecorino|mozzarell|ricotta|mascarpone|yogurt|uov|tuorl|stracchino|gorgonzola|grana|scamorza|provola/i],
  ['carne_pesce', /carne|manzo|maiale|pollo|tacchino|vitello|agnello|salsicc|guancial|pancett|prosciutt|speck|salame|bresaola|mortadell|pesce|salmone|tonno|merluzz|gamber|cozze|vongole|calamar|polpo|acciugh|alici/i],
  ['frutta_verdura', /pomodor|cipoll|aglio|carot|sedano|patat|zucchin|melanzan|peperon|spinac|insalat|lattug|rucola|basilico|prezzemolo|rosmarino|salvia|menta|limon|aranc|mel[ae]\b|pera|banan|fragol|zucca|funghi|porri|cavol|broccol|carciof|avocado|lime|zenzero|frutta|verdura/i],
  ['panetteria', /\bpane\b|pangrattato|grissini|crackers?|piadin|focaccia/i],
  ['bevande', /\bvino\b|birra|acqua|succo|bibit/i],
  ['dispensa', /farina|zucchero|sale|pepe|olio|aceto|pasta|spaghetti|riso|lievito|cacao|cioccolat|caff|miele|ceci|fagioli|lenticchie|passata|pelati|brodo|spezie|biscotti|cereali|tè\b|the\b/i],
];

export function guessAisle(name: string): string {
  return AISLE_WORDS.find(([, re]) => re.test(name))?.[0] ?? 'altro';
}

/** Lista come testo, da incollare in chat o in una nota. */
export function listAsText(
  title: string,
  items: { name: string; quantity: number | null; unit: string | null; aisle: string; checked: boolean }[],
  aisleLabel: (aisle: string) => string,
  format: (i: { name: string; quantity: number | null; unit: string | null }) => string,
): string {
  const open = items.filter((i) => !i.checked);
  const groups = new Map<string, string[]>();
  for (const i of open) groups.set(i.aisle, [...(groups.get(i.aisle) ?? []), `- ${format(i)}`]);
  return [title, ...[...groups.entries()].map(([aisle, lines]) => `\n${aisleLabel(aisle)}\n${lines.join('\n')}`)].join('\n');
}
