// Ricette dai siti web SENZA AI: quasi tutti i siti di ricette pubblicano una scheda
// strutturata (schema.org/Recipe) per Google. Qui la trasformiamo nel formato di Morso.
// È gratis, istantaneo e preciso: l'AI serve solo per i post dei social.

import { AISLES, type CleanExtraction, type CleanIngredient, RECIPE_TAGS } from './extraction.ts';

type Aisle = (typeof AISLES)[number];

// ------------------------------------------------------------------ testo

const FRACTIONS: Record<string, string> = {
  '½': ' 1/2',
  '¼': ' 1/4',
  '¾': ' 3/4',
  '⅓': ' 1/3',
  '⅔': ' 2/3',
  '⅛': ' 1/8',
};

function plain(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// ------------------------------------------------------------------ ingredienti

/** Unità riconosciute → [unità di Morso, fattore di conversione]. */
const UNITS: [RegExp, string, number][] = [
  [/^(kg|chili|chilogrammi?|kilos?)$/i, 'kg', 1],
  [/^(g|gr|grammi?|grams?)$/i, 'g', 1],
  [/^(mg)$/i, 'mg', 1],
  [/^(l|lt|litri?|liters?|litres?)$/i, 'l', 1],
  [/^(dl)$/i, 'ml', 100],
  [/^(cl)$/i, 'ml', 10],
  [/^(ml|millilitri?|milliliters?)$/i, 'ml', 1],
  [/^(cucchiai|cucchiaio|tbsp|tablespoons?)$/i, 'cucchiaio', 1],
  [/^(cucchiaini|cucchiaino|tsp|teaspoons?)$/i, 'cucchiaino', 1],
  [/^(cups?)$/i, 'ml', 240],
  [/^(tazze|tazza|tazzine|tazzina)$/i, 'tazza', 1],
  [/^(oz|ounces?)$/i, 'g', 28],
  [/^(lbs?|pounds?)$/i, 'g', 454],
  [/^(bicchieri|bicchiere)$/i, 'bicchiere', 1],
  [/^(pizzichi|pizzico|pinch)$/i, 'pizzico', 1],
  [/^(spicchi|spicchio|cloves?)$/i, 'spicchio', 1],
  [/^(fette|fetta|slices?)$/i, 'fetta', 1],
  [/^(foglie|foglia|leaves|leaf)$/i, 'foglia', 1],
  [/^(mazzetti|mazzetto|bunch)$/i, 'mazzetto', 1],
  [/^(rametti|rametto|sprigs?)$/i, 'rametto', 1],
  [/^(bustine|bustina)$/i, 'bustina', 1],
  [/^(vasetti|vasetto)$/i, 'vasetto', 1],
  [/^(lattine|lattina|cans?)$/i, 'lattina', 1],
  [/^(pezzi|pezzo|pieces?)$/i, 'pezzo', 1],
];

/** Parole chiave → reparto del supermercato (indovinato; si può correggere a mano). */
const AISLE_WORDS: [Aisle, RegExp][] = [
  ['surgelati', /surgelat|frozen/i],
  [
    'latticini',
    /latte|burro|panna|formagg|parmigian|pecorino|mozzarell|ricotta|mascarpone|yogurt|uov|tuorl|album|stracchino|gorgonzola|grana|scamorza|provola|milk|butter|cream|cheese|eggs?\b/i,
  ],
  [
    'carne_pesce',
    /carne|manzo|maiale|pollo|tacchino|vitello|agnello|salsicc|guancial|pancett|prosciutt|speck|salame|bresaola|mortadell|pesce|salmone|tonno|merluzz|gamber|cozze|vongole|calamar|polpo|acciugh|alici|beef|pork|chicken|bacon|fish|shrimp/i,
  ],
  [
    'frutta_verdura',
    /pomodor|cipoll|aglio|carot|sedano|patat|zucchin|melanzan|peperon|spinac|insalat|lattug|rucola|basilico|prezzemolo|rosmarino|salvia|menta|timo|origano fresco|limon|aranc|mela|pera|banan|fragol|frutti di bosco|zucca|funghi|porri|cavol|broccol|carciof|piselli freschi|avocado|lime|zenzero|onion|garlic|tomato|potato|lemon|apple|herbs?/i,
  ],
  ['panetteria', /\bpane\b|pangrattato|pan grattato|grissini|crackers?|piadin|bread/i],
  ['bevande', /\bvino\b|birra|acqua frizzante|succo|wine|beer|juice/i],
  [
    'dispensa',
    /farina|zucchero|sale|pepe|olio|aceto|pasta|spaghetti|riso|lievito|cacao|cioccolat|caffè|miele|legumi|ceci|fagioli|lenticchie|tonno in scatola|passata|pelati|concentrato|brodo|spezie|curcuma|paprika|cannella|noce moscata|vaniglia|mandorle|nocciole|noci|pinoli|uvetta|biscotti|amido|fecola|flour|sugar|salt|pepper|oil|vinegar|rice|yeast|honey|vanilla/i,
  ],
];

export function guessAisle(name: string): Aisle {
  return AISLE_WORDS.find(([, re]) => re.test(name))?.[0] ?? 'altro';
}

function parseAmount(text: string): { value: number; rest: string } | null {
  // frazioni prima dei decimali: "1 1/2", "1/2"; poi "1,5", "200"; "2-3" → si prende il primo
  const range = /^(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*/;
  const fraction = text.match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)/);
  if (fraction && Number(fraction[3]) !== 0) {
    const value = Number(fraction[1] ?? 0) + Number(fraction[2]) / Number(fraction[3]);
    const rest = text.slice(fraction[0].length);
    return { value: Math.round(value * 1000) / 1000, rest: rest.replace(range, '') };
  }
  const decimal = text.match(/^(\d+(?:[.,]\d+)?)/);
  if (decimal) {
    const rest = text.slice(decimal[0].length);
    return { value: Number(decimal[1].replace(',', '.')), rest: rest.replace(range, '') };
  }
  const word = text.match(/^(un|una|uno|un')\s*/i);
  return word ? { value: 1, rest: text.slice(word[0].length) } : null;
}

/** "320 g di spaghetti" → { quantity: 320, unit: "g", name: "spaghetti" } */
export function parseIngredientLine(line: string): CleanIngredient | null {
  let text = plain(line);
  for (const [frac, rep] of Object.entries(FRACTIONS)) text = text.replaceAll(frac, rep);
  text = text.trim().replace(/^[-•*·]\s*/, '');
  if (!text) return null;

  let note: string | null = null;
  if (/\bq\.?\s?b\.?\b|quanto basta|to taste/i.test(text)) {
    note = 'q.b.';
    text = text.replace(/\(?\s*\bq\.?\s?b\.?\b\s*\)?|\(?\s*quanto basta\s*\)?|\(?\s*to taste\s*\)?/gi, '').trim();
  }

  let quantity: number | null = null;
  let unit: string | null = null;
  const amount = parseAmount(text);
  if (amount) {
    quantity = amount.value;
    text = amount.rest;
    // unità attaccata o separata: "200g", "200 g", "2 cucchiai"
    const unitMatch = text.match(/^([a-zA-Zàèéìòù.]+)\.?\s*/);
    if (unitMatch) {
      const token = unitMatch[1].replace(/\.$/, '');
      const found = UNITS.find(([re]) => re.test(token));
      if (found) {
        unit = found[1];
        quantity = Math.round(quantity * found[2] * 100) / 100;
        text = text.slice(unitMatch[0].length);
      }
    }
  }

  // "di", "d'" dopo la quantità; dettagli tra parentesi → nota
  text = text.replace(/^(di|d'|of)\s+/i, '').replace(/^d'/i, '');
  const paren = text.match(/\(([^)]+)\)/);
  if (paren) {
    note = note ?? paren[1].trim();
    text = text.replace(paren[0], '').trim();
  }
  text = text.replace(/[\s,.;:]+$/, '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const name = text.charAt(0).toLowerCase() + text.slice(1);
  return { quantity, unit, name: name.slice(0, 120), note, aisle: guessAisle(name), estimated: false };
}

// ------------------------------------------------------------------ passaggi e tempi

/** Cerca un tempo nel passaggio: "cuoci per 10 minuti" → 600 secondi. */
export function detectTimerSeconds(text: string): number | null {
  const m = text.match(
    /(\d+(?:[.,]\d+)?)\s*(?:-\s*\d+\s*)?(ore|ora|h|hours?|minuti|minuto|min|minutes?|secondi|seconds?|sec)\b/i,
  );
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  const u = m[2].toLowerCase();
  const seconds = /^(ore|ora|h|hour)/.test(u) ? n * 3600 : /^(sec)/.test(u) ? n : n * 60;
  return seconds > 0 && seconds <= 86_400 ? Math.round(seconds) : null;
}

/** "PT1H30M" → 90 · "P0DT0H20M" → 20 */
export function isoDurationToMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m) return null;
  const minutes = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) +
    Math.round(Number(m[4] ?? 0) / 60);
  return minutes > 0 && minutes <= 20_000 ? minutes : null;
}

function collectSteps(node: unknown, out: string[], depth = 0) {
  if (depth > 4 || out.length >= 60) return;
  if (typeof node === 'string') {
    // a volte tutto il procedimento è una stringa unica con a capo o numeri
    for (const part of node.split(/\n+|(?:^|\s)\d+\.\s+(?=[A-ZÀ-Ý])/)) {
      const text = plain(part);
      if (text) out.push(text);
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectSteps(item, out, depth + 1);
    return;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (obj.itemListElement) return collectSteps(obj.itemListElement, out, depth + 1); // HowToSection
    const text = plain(obj.text) || plain(obj.name);
    if (text) out.push(text);
  }
}

function firstNumber(value: unknown): number | null {
  const s = Array.isArray(value) ? value.map(String).join(' ') : String(value ?? '');
  const m = s.match(/\d+/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 100 ? n : null;
}

const TAG_WORDS: [(typeof RECIPE_TAGS)[number], RegExp][] = [
  ['dolce', /dolc|dessert|torta|biscott|cake|cookie/i],
  ['primo', /\bprimi\b|\bprimo\b|pasta|risott|gnocch/i],
  ['secondo', /\bsecond/i],
  ['antipasto', /antipast|appetizer|starter/i],
  ['contorno', /contorn|side dish/i],
  ['colazione', /colazion|breakfast/i],
  ['zuppa', /zupp|minestr|vellutat|soup/i],
  ['insalata', /insalat|salad/i],
  ['pane e lievitati', /\bpane\b|lievitat|pizza|focacc|bread/i],
  ['vegano', /vegan/i],
  ['vegetariano', /vegetarian/i],
  ['senza glutine', /senza glutine|gluten.?free/i],
  ['senza lattosio', /senza lattosio|lactose.?free|dairy.?free/i],
  ['pesce', /pesce|fish|seafood/i],
  ['piccante', /piccant|spicy/i],
  ['friggitrice ad aria', /friggitrice ad aria|air fryer/i],
];

// ------------------------------------------------------------------ conversione

/**
 * Converte una scheda schema.org/Recipe nel formato di Morso.
 * Restituisce null se la scheda non ha abbastanza dati (allora ci pensa l'AI).
 */
export function recipeFromJsonLd(data: Record<string, unknown>): CleanExtraction | null {
  const title = plain(data.name).slice(0, 200);
  const rawIngredients = Array.isArray(data.recipeIngredient)
    ? data.recipeIngredient
    : Array.isArray(data.ingredients)
    ? data.ingredients
    : [];
  const ingredients = rawIngredients
    .map((line) => (typeof line === 'string' ? parseIngredientLine(line) : null))
    .filter((i): i is CleanIngredient => !!i)
    .slice(0, 80);
  const stepTexts: string[] = [];
  collectSteps(data.recipeInstructions, stepTexts);
  const steps = stepTexts.slice(0, 60).map((text) => ({
    text: text.slice(0, 2000),
    timer_seconds: detectTimerSeconds(text),
  }));
  if (!title || !ingredients.length) return null;

  const prep = isoDurationToMinutes(data.prepTime);
  const cook = isoDurationToMinutes(data.cookTime);
  const total = isoDurationToMinutes(data.totalTime) ??
    (prep !== null || cook !== null ? (prep ?? 0) + (cook ?? 0) : null);

  const tagText = [data.keywords, data.recipeCategory, data.recipeCuisine, data.suitableForDiet, title]
    .flat()
    .map((v) => (typeof v === 'string' ? v : ''))
    .join(' ');
  const tags = new Set<string>(TAG_WORDS.filter(([, re]) => re.test(tagText)).map(([tag]) => tag));
  if (tags.has('vegano')) tags.add('vegetariano');
  if (total !== null && total <= 30) tags.add('veloce');

  const missingInfo: string[] = [];
  if (!steps.length) missingInfo.push('passaggi');

  return {
    kind: 'recipe',
    confidence: 'high',
    missingInfo,
    recipe: {
      title,
      description: plain(data.description).slice(0, 500) || null,
      servings: firstNumber(data.recipeYield),
      servings_estimated: false,
      prep_minutes: prep,
      cook_minutes: cook,
      total_minutes: total,
      tags: [...tags],
      ingredients,
      steps,
    },
    places: [],
  };
}

/** La scheda è in italiano? (se no, meglio farla tradurre all'AI quando disponibile) */
export function isItalian(data: Record<string, unknown>, pageUrl: string): boolean {
  const lang = typeof data.inLanguage === 'string' ? data.inLanguage.toLowerCase() : null;
  if (lang) return lang.startsWith('it');
  try {
    return new URL(pageUrl).hostname.endsWith('.it');
  } catch {
    return false;
  }
}
