// Estrazione con Google Gemini (piano gratuito: basta una chiave di Google AI Studio, senza carta).
// La chiave GEMINI_API_KEY esiste solo come segreto della Edge Function: mai nel sito.

import type { Extractor } from './ai.ts';
import { AISLES, buildUserMessage, ExtractionSchema, RECIPE_TAGS, SYSTEM_PROMPT } from './extraction.ts';

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
            },
            required: ['quantity', 'unit', 'name', 'note', 'aisle'],
            propertyOrdering: ['quantity', 'unit', 'name', 'note', 'aisle'],
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
      },
      required: [
        'title',
        'description',
        'servings',
        'prep_minutes',
        'cook_minutes',
        'total_minutes',
        'tags',
        'ingredients',
        'steps',
      ],
      propertyOrdering: [
        'title',
        'description',
        'servings',
        'prep_minutes',
        'cook_minutes',
        'total_minutes',
        'tags',
        'ingredients',
        'steps',
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

/** `fetchImpl` serve solo ai test, per simulare le risposte dell'API. */
export function createGeminiExtractor(apiKey: string, opts: { model?: string; fetch?: typeof fetch } = {}): Extractor {
  const model = opts.model || DEFAULT_MODEL;
  const doFetch = opts.fetch ?? fetch;

  return async (input) => {
    let res: Response;
    try {
      res = await doFetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        signal: AbortSignal.timeout(90_000),
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: buildUserMessage(input) }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: GEMINI_RESPONSE_SCHEMA,
            temperature: 0.2,
            maxOutputTokens: 16384,
          },
        }),
      });
    } catch (e) {
      console.error('Gemini request failed', e);
      return { ok: false, reason: 'api_error' };
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as GeminiResponse;
      console.error('Gemini API error', res.status, body.error?.status, body.error?.message);
      if (res.status === 429) return { ok: false, reason: 'rate_limited' };
      if (res.status === 401 || res.status === 403) return { ok: false, reason: 'auth' };
      if (res.status === 400 && /api key|API_KEY/i.test(`${body.error?.message} ${body.error?.status}`)) {
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
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, reason: 'invalid_output' };
    }
    const parsed = ExtractionSchema.safeParse(json);
    if (!parsed.success) {
      console.error('Gemini output does not match schema', parsed.error.issues.slice(0, 5));
      return { ok: false, reason: 'invalid_output' };
    }
    return {
      ok: true,
      extraction: parsed.data,
      model: data.modelVersion ?? model,
      usage: {
        input: data.usageMetadata?.promptTokenCount ?? 0,
        output: data.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  };
}
