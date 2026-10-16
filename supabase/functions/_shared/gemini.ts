// Estrazione con Google Gemini (piano gratuito: basta una chiave di Google AI Studio, senza carta).
// La chiave GEMINI_API_KEY esiste solo come segreto della Edge Function: mai nel sito.

import type { DoseEstimator, Extractor, Failure, RecipeTools } from './ai.ts';
import { buildDoseMessage, DOSE_SYSTEM_PROMPT, DoseSchema, GEMINI_DOSE_SCHEMA } from './doses.ts';
import { AISLES, buildUserMessage, ExtractionSchema, RECIPE_TAGS, SYSTEM_PROMPT } from './extraction.ts';
import { GEMINI_INSIGHTS_SCHEMA, INSIGHTS_SYSTEM_PROMPT, InsightsSchema } from './insights.ts';
import {
  GEMINI_VARIANT_SCHEMA,
  recipeAsText,
  VARIANT_KINDS,
  VARIANT_SYSTEM_PROMPT,
  VariantSchema,
} from './recipeTools.ts';

/** "gemini-flash-latest" punta sempre al modello Flash più recente (incluso nel piano gratuito). */
export const DEFAULT_MODEL = 'gemini-flash-latest';
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

// Schema della risposta nel formato richiesto da Gemini (sottoinsieme di OpenAPI).
const nullable = (type: string, description?: string) => ({
  type,
  nullable: true,
  ...(description ? { description } : {}),
});
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    kind: { type: 'STRING', enum: ['recipe', 'places', 'unknown'] },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    missing_info: { type: 'ARRAY', items: { type: 'STRING' } },
    recipe: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        title: { type: 'STRING' },
        description: nullable('STRING'),
        servings: nullable('INTEGER'),
        servings_estimated: { type: 'BOOLEAN' },
        prep_minutes: nullable('INTEGER'),
        cook_minutes: nullable('INTEGER'),
        total_minutes: nullable('INTEGER'),
        tags: { type: 'ARRAY', items: { type: 'STRING', enum: [...RECIPE_TAGS] } },
        ingredients: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              quantity: nullable('NUMBER', 'null se q.b.'),
              unit: nullable(
                'STRING',
                'g, kg, ml, l, cucchiaio, cucchiaino, tazza, pezzo, spicchio, pizzico, fetta, mazzetto',
              ),
              name: { type: 'STRING' },
              note: nullable('STRING'),
              aisle: { type: 'STRING', enum: [...AISLES] },
              estimated: { type: 'BOOLEAN', description: 'true se la quantità è stimata (non era nel testo)' },
            },
            required: ['quantity', 'unit', 'name', 'note', 'aisle', 'estimated'],
            propertyOrdering: ['quantity', 'unit', 'name', 'note', 'aisle', 'estimated'],
          },
        },
        steps: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { text: { type: 'STRING' }, timer_seconds: nullable('INTEGER') },
            required: ['text', 'timer_seconds'],
            propertyOrdering: ['text', 'timer_seconds'],
          },
        },
        insights: { ...GEMINI_INSIGHTS_SCHEMA, nullable: true },
      },
      required: [
        'title',
        'description',
        'servings',
        'servings_estimated',
        'prep_minutes',
        'cook_minutes',
        'total_minutes',
        'tags',
        'ingredients',
        'steps',
        'insights',
      ],
      propertyOrdering: [
        'title',
        'description',
        'servings',
        'servings_estimated',
        'prep_minutes',
        'cook_minutes',
        'total_minutes',
        'tags',
        'ingredients',
        'steps',
        'insights',
      ],
    },
    places: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          city: nullable('STRING'),
          address: nullable('STRING'),
          cuisine: nullable('STRING'),
          recommended_dishes: { type: 'ARRAY', items: { type: 'STRING' } },
          price_level: nullable('INTEGER', 'da 1 a 4'),
        },
        required: ['name', 'city', 'address', 'cuisine', 'recommended_dishes', 'price_level'],
        propertyOrdering: ['name', 'city', 'address', 'cuisine', 'recommended_dishes', 'price_level'],
      },
    },
  },
  required: ['kind', 'confidence', 'missing_info', 'recipe', 'places'],
  propertyOrdering: ['kind', 'confidence', 'missing_info', 'recipe', 'places'],
};

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  modelVersion?: string;
  error?: { status?: string; message?: string };
};

const BLOCKED = ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY'];

type GeminiOptions = { model?: string; fetch?: typeof fetch; timeoutMs?: number };
type JsonOutcome = { ok: true; json: unknown; model: string; usage: { input: number; output: number } } | Failure;

/** Chiamata generica a Gemini che restituisce JSON secondo uno schema. */
function createGeminiJsonClient(apiKey: string, opts: GeminiOptions) {
  const model = opts.model || DEFAULT_MODEL;
  const doFetch = opts.fetch ?? fetch;

  // Una richiesta con tempo massimo; il piano gratuito a volte è lento: in quel caso si riprova una volta.
  const call = (body: string) =>
    doFetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 55_000),
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body,
    });

  return async (
    system: string,
    user: string,
    schema: unknown,
    images: { mimeType: string; data: string }[] = [],
  ): Promise<JsonOutcome> => {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{
        role: 'user',
        parts: [...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })), { text: user }],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature: 0.2,
        maxOutputTokens: 16384,
      },
    });

    let res: Response | null = null;
    for (let attempt = 1; attempt <= 2 && !res; attempt++) {
      try {
        res = await call(body);
        // sovraccarico momentaneo: un secondo tentativo spesso va
        if (res.status >= 500 && attempt === 1) {
          await res.body?.cancel();
          res = null;
        }
      } catch (e) {
        console.error(`Gemini request failed (tentativo ${attempt})`, e instanceof Error ? e.name : e);
        if (attempt === 2) {
          return { ok: false, reason: e instanceof Error && e.name === 'TimeoutError' ? 'overloaded' : 'api_error' };
        }
      }
    }
    if (!res) return { ok: false, reason: 'overloaded' };

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as GeminiResponse;
      console.error('Gemini API error', res.status, errBody.error?.status, errBody.error?.message);
      if (res.status === 429) return { ok: false, reason: 'rate_limited' };
      if (res.status === 401 || res.status === 403) return { ok: false, reason: 'auth' };
      if (res.status === 400 && /api key|API_KEY/i.test(`${errBody.error?.message} ${errBody.error?.status}`)) {
        return { ok: false, reason: 'auth' };
      }
      if (res.status >= 500) return { ok: false, reason: 'overloaded' };
      return { ok: false, reason: 'api_error' };
    }

    const data = (await res.json()) as GeminiResponse;
    if (data.promptFeedback?.blockReason) return { ok: false, reason: 'refusal' };
    const candidate = data.candidates?.[0];
    const finish = candidate?.finishReason ?? '';
    if (BLOCKED.includes(finish)) return { ok: false, reason: 'refusal' };
    if (finish === 'MAX_TOKENS') return { ok: false, reason: 'truncated' };

    // le parti marcate "thought" sono ragionamento interno, non la risposta
    const text = (candidate?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('');
    try {
      return {
        ok: true,
        json: JSON.parse(text),
        model: data.modelVersion ?? model,
        usage: {
          input: data.usageMetadata?.promptTokenCount ?? 0,
          output: data.usageMetadata?.candidatesTokenCount ?? 0,
        },
      };
    } catch {
      return { ok: false, reason: 'invalid_output' };
    }
  };
}

/** Estrae ricetta o locali dal testo di un post. `fetch` nelle opzioni serve solo ai test. */
export function createGeminiExtractor(apiKey: string, opts: GeminiOptions = {}): Extractor {
  const generate = createGeminiJsonClient(apiKey, opts);
  return async (input) => {
    const r = await generate(
      SYSTEM_PROMPT,
      buildUserMessage(input),
      GEMINI_RESPONSE_SCHEMA,
      input.image ? [input.image] : [],
    );
    if (!r.ok) return r;
    const parsed = ExtractionSchema.safeParse(r.json);
    if (!parsed.success) {
      console.error('Gemini output does not match schema', parsed.error.issues.slice(0, 5));
      return { ok: false, reason: 'invalid_output' };
    }
    return { ok: true, extraction: parsed.data, model: r.model, usage: r.usage };
  };
}

/** Stima le dosi mancanti di una ricetta. */
export function createGeminiDoseEstimator(apiKey: string, opts: GeminiOptions = {}): DoseEstimator {
  const generate = createGeminiJsonClient(apiKey, opts);
  return async (input) => {
    const r = await generate(DOSE_SYSTEM_PROMPT, buildDoseMessage(input), GEMINI_DOSE_SCHEMA);
    if (!r.ok) return r;
    const parsed = DoseSchema.safeParse(r.json);
    if (!parsed.success) return { ok: false, reason: 'invalid_output' };
    return { ok: true, estimate: parsed.data, model: r.model, usage: r.usage };
  };
}

/** Valori/difficoltà/costo e varianti di una ricetta salvata. */
export function createGeminiRecipeTools(apiKey: string, opts: GeminiOptions = {}): RecipeTools {
  const generate = createGeminiJsonClient(apiKey, opts);
  return {
    async insights(recipe) {
      const r = await generate(INSIGHTS_SYSTEM_PROMPT, recipeAsText(recipe), GEMINI_INSIGHTS_SCHEMA);
      if (!r.ok) return r;
      const parsed = InsightsSchema.safeParse(r.json);
      if (!parsed.success) return { ok: false, reason: 'invalid_output' };
      return { ok: true, insights: parsed.data, model: r.model, usage: r.usage };
    },
    async variant(recipe, kind) {
      const request = `Versione richiesta: ${VARIANT_KINDS[kind]}.\n\n${recipeAsText(recipe)}`;
      const r = await generate(VARIANT_SYSTEM_PROMPT, request, GEMINI_VARIANT_SCHEMA);
      if (!r.ok) return r;
      const parsed = VariantSchema.safeParse(r.json);
      if (!parsed.success) return { ok: false, reason: 'invalid_output' };
      return { ok: true, variant: parsed.data, model: r.model, usage: r.usage };
    },
  };
}
