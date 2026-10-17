// Porzioni preferite (Profilo): "per me la pasta è 100 g a persona".
// Si applicano alle ricette quando vengono mostrate, cucinate o messe in lista della spesa:
// la ricetta salvata resta com'è, cambia solo quello che vedi tu.

import { normalize } from '@/features/library/filter';

export type PortionKey = 'pasta' | 'riso' | 'carne' | 'pesce';
export type PortionPrefs = Partial<Record<PortionKey, number>>;

export const PORTION_KEYS: PortionKey[] = ['pasta', 'riso', 'carne', 'pesce'];
/** Valori di partenza quando inizi a personalizzare (crudo, a persona). */
export const PORTION_DEFAULTS: Record<PortionKey, number> = { pasta: 80, riso: 80, carne: 150, pesce: 150 };
export const PORTION_MIN = 20;
export const PORTION_MAX = 500;
export const PORTION_STEP = 10;

// Parole che indicano l'ingrediente; quelle "escluse" lo fanno ignorare (pasta frolla, farina di riso…).
const WORDS: Record<PortionKey, { include: string[]; exclude: string[] }> = {
  pasta: {
    include: [
      'pasta', 'spaghetti', 'spaghettoni', 'penne', 'fusilli', 'rigatoni', 'linguine', 'tagliatelle', 'tagliolini',
      'fettuccine', 'pappardelle', 'farfalle', 'orecchiette', 'paccheri', 'mezze maniche', 'bucatini', 'trofie',
      'maccheroni', 'ziti', 'casarecce', 'calamarata', 'mafalde', 'vermicelli', 'conchiglie', 'ditalini', 'tubetti',
      'gramigna', 'strozzapreti', 'pici', 'reginette', 'sedanini', 'tortiglioni', 'cavatelli', 'busiate',
    ],
    exclude: ['frolla', 'sfoglia', 'brise', 'madre', 'zucchero', 'pizza', 'pane', 'mandorl', 'acciugh', 'fresc', 'ripien', 'choux', 'bignè', 'bigne', 'gnocchi', 'lasagn'],
  },
  riso: {
    include: ['riso', 'carnaroli', 'arborio', 'vialone', 'basmati', 'jasmine', 'risotto'],
    exclude: ['farina', 'latte', 'aceto', 'carta', 'bevanda', 'soffiato', 'gallette', 'amido', 'vino', 'sciroppo'],
  },
  carne: {
    include: [
      'pollo', 'petto di pollo', 'petti di pollo', 'tacchino', 'manzo', 'vitello', 'vitellone', 'maiale', 'lonza', 'arista',
      'filetto', 'bistecca', 'bistecche', 'fettine', 'carne', 'macinato', 'macinata', 'hamburger', 'agnello', 'coniglio',
      'salsiccia', 'salsicce', 'spezzatino', 'scaloppine', 'sovracosce', 'braciole', 'costine', 'cotolette', 'tagliata',
    ],
    exclude: ['brodo', 'dado', 'estratto', 'fondo', 'prosciutto', 'pancetta', 'guanciale', 'speck', 'salame', 'mortadella', 'lardo', 'bresaola'],
  },
  pesce: {
    include: [
      'pesce', 'salmone', 'merluzzo', 'orata', 'branzino', 'spigola', 'baccala', 'stoccafisso', 'trota', 'sgombro',
      'sogliola', 'platessa', 'nasello', 'tonno fresco', 'trancio', 'tranci', 'pesce spada', 'gamberi', 'gamberoni',
      'mazzancolle', 'calamari', 'totani', 'seppie', 'polpo', 'filetto di', 'filetti di',
    ],
    exclude: ['brodo', 'dado', 'salsa', 'colatura', 'sott', 'scatola', 'pasta di', 'affumicato', 'bastoncini'],
  },
};

// Sotto questa quantità a persona è un condimento (es. 30 g di salsiccia nel sugo), non la porzione.
const MIN_PER_PERSON: Record<PortionKey, number> = { pasta: 30, riso: 30, carne: 50, pesce: 50 };

// Valori medi per grammo (crudo): servono a correggere calorie e macro quando cambi la porzione.
export const PER_GRAM: Record<PortionKey, { kcal: number; protein: number; carbs: number; fat: number }> = {
  pasta: { kcal: 3.55, protein: 0.12, carbs: 0.71, fat: 0.015 },
  riso: { kcal: 3.6, protein: 0.07, carbs: 0.79, fat: 0.006 },
  carne: { kcal: 1.6, protein: 0.21, carbs: 0, fat: 0.08 },
  pesce: { kcal: 1.3, protein: 0.2, carbs: 0, fat: 0.05 },
};

// parola intera (al massimo due lettere in più per i plurali): "riso" sì, "risorse" no
const hasWord = (name: string, word: string) => new RegExp(`(^|[^a-z])${word}[a-z]{0,2}($|[^a-z])`).test(name);

/** A quale porzione appartiene l'ingrediente (o null). Il pesce si controlla prima: "filetto di salmone". */
export function portionCategory(ingredientName: string): PortionKey | null {
  const name = normalize(ingredientName);
  for (const key of ['pesce', 'pasta', 'riso', 'carne'] as PortionKey[]) {
    const { include, exclude } = WORDS[key];
    if (exclude.some((w) => name.includes(normalize(w)))) continue;
    if (include.some((w) => hasWord(name, normalize(w)))) return key;
  }
  return null;
}

/** Tiene solo valori sensati (numeri interi tra 20 e 500 g). */
export function cleanPrefs(raw: unknown): PortionPrefs {
  const out: PortionPrefs = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const key of PORTION_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = Math.round(Math.min(PORTION_MAX, Math.max(PORTION_MIN, v)));
  }
  return out;
}

type Ing = { name: string; quantity: number | null; unit: string | null };

export type Personalized<T> = T & { personalized?: boolean };

/**
 * Applica le porzioni preferite agli ingredienti di una ricetta per `servings` persone.
 * Restituisce gli ingredienti (quelli cambiati hanno personalized = true) e
 * quanti grammi in più (o in meno) ci sono A PERSONA per ogni tipo.
 */
export function personalize<T extends Ing>(
  ingredients: T[],
  servings: number | null,
  prefs: PortionPrefs,
): { ingredients: Personalized<T>[]; deltaPerPerson: Partial<Record<PortionKey, number>> } {
  const deltaPerPerson: Partial<Record<PortionKey, number>> = {};
  if (!servings || servings <= 0 || !Object.keys(prefs).length) return { ingredients, deltaPerPerson };
  const out = ingredients.map((i): Personalized<T> => {
    const unit = (i.unit ?? '').trim().toLowerCase();
    if (i.quantity === null || i.quantity <= 0 || !['g', 'gr', 'grammi', 'kg'].includes(unit)) return i;
    const key = portionCategory(i.name);
    const pref = key ? prefs[key] : undefined;
    if (!key || !pref) return i;
    const grams = unit === 'kg' ? i.quantity * 1000 : i.quantity;
    const perPerson = grams / servings;
    if (perPerson < MIN_PER_PERSON[key]) return i;
    deltaPerPerson[key] = (deltaPerPerson[key] ?? 0) + (pref - perPerson);
    const total = pref * servings;
    return { ...i, quantity: unit === 'kg' ? total / 1000 : total, personalized: true };
  });
  return { ingredients: out, deltaPerPerson };
}

export type Nutrition = { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null };

/** Corregge calorie e macro a porzione in base ai grammi cambiati (mai sotto zero). */
export function adjustNutrition(n: Nutrition, deltaPerPerson: Partial<Record<PortionKey, number>>): Nutrition {
  const add = (value: number | null, field: 'kcal' | 'protein' | 'carbs' | 'fat', digits: number) => {
    if (value === null) return null;
    let v = value;
    for (const key of PORTION_KEYS) v += (deltaPerPerson[key] ?? 0) * PER_GRAM[key][field];
    const f = 10 ** digits;
    return Math.max(0, Math.round(v * f) / f);
  };
  return { kcal: add(n.kcal, 'kcal', 0), protein: add(n.protein, 'protein', 1), carbs: add(n.carbs, 'carbs', 1), fat: add(n.fat, 'fat', 1) };
}

type RecipeLike<T extends Ing> = {
  servings: number | null;
  recipe_ingredients: T[];
  kcal_per_serving: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

/** Ricetta "su misura": ingredienti con le tue porzioni e calorie/macro a porzione corrette. */
export function personalRecipe<T extends Ing>(r: RecipeLike<T>, prefs: PortionPrefs) {
  const { ingredients, deltaPerPerson } = personalize(r.recipe_ingredients, r.servings, prefs);
  const num = (v: number | null) => (v === null ? null : Number(v));
  const nutrition = adjustNutrition(
    { kcal: num(r.kcal_per_serving), protein: num(r.protein_g), carbs: num(r.carbs_g), fat: num(r.fat_g) },
    deltaPerPerson,
  );
  return { ingredients, nutrition, changed: ingredients !== r.recipe_ingredients && ingredients.some((i) => i.personalized) };
}
