// Frigo/Spesa → "Crea una ricetta": con cosa cucinare e preferenze (ricordate su questo dispositivo).

export const COOK_TOOLS = ['forno', 'friggitrice ad aria', 'padella', 'pentola'] as const;
export type CookTool = (typeof COOK_TOOLS)[number];
export const TOOL_EMOJI: Record<CookTool, string> = { forno: '🔥', 'friggitrice ad aria': '💨', padella: '🍳', pentola: '🍲' };

export const QUICK_PREFS = ['vegetariana', 'leggera', 'proteica', 'senza glutine', 'senza lattosio', 'per bambini', 'piccante'] as const;

const KEY = 'morso.recipePrefs';
type Saved = { tools: CookTool[]; prefs: string[] };

export function loadRecipePrefs(): Saved {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    return {
      tools: (raw?.tools ?? []).filter((x): x is CookTool => (COOK_TOOLS as readonly string[]).includes(x)),
      prefs: (raw?.prefs ?? []).filter((x): x is string => typeof x === 'string').slice(0, 8),
    };
  } catch {
    return { tools: [], prefs: [] };
  }
}

export function saveRecipePrefs(value: Saved) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(value));
  } catch {
    // niente da fare
  }
}

/** "senza cipolla, poco sale" → ["senza cipolla", "poco sale"] */
export function splitPrefs(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((p) => p.replace(/\s+/g, ' ').trim().slice(0, 100))
    .filter(Boolean)
    .slice(0, 8);
}
