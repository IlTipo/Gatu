// Estrazione con Google Gemini (piano gratuito: basta una chiave di Google AI Studio, senza carta).
// La chiave GEMINI_API_KEY esiste solo come segreto della Edge Function: mai nel sito.

import type { DoseEstimator, Extractor, Failure, RecipeTools } from './ai.ts';
import { ASK_SYSTEM_PROMPT, AskSchema, buildAskMessage, GEMINI_ASK_SCHEMA } from './ask.ts';
import { buildDoseMessage, DOSE_SYSTEM_PROMPT, DoseSchema, GEMINI_DOSE_SCHEMA } from './doses.ts';
import {
  buildFridgeMessage,
  FRIDGE_RECIPE_PROMPT,
  FRIDGE_SCAN_PROMPT,
  FridgeRecipeSchema,
  FridgeScanSchema,
  GEMINI_FRIDGE_RECIPE_SCHEMA,
  GEMINI_FRIDGE_SCAN_SCHEMA,
} from './fridge.ts';
import { GEMINI_SHOPPING_SCAN_SCHEMA, SHOPPING_SCAN_PROMPT, ShoppingScanSchema } from './shoppingPhoto.ts';
import { buildFoodMessage, FOOD_PROMPT, FoodSchema, GEMINI_FOOD_SCHEMA } from './food.ts';
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
/**
 * Ogni modello ha la sua quota gratuita giornaliera (per Flash sono poche richieste al giorno).
 * Quando finisce, si passa da solo al modello "lite", che ha una quota separata.
 */
export const DEFAULT_FALLBACK_MODELS = ['gemini-flash-lite-latest'];
const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const FILES_API = 'https://generativelanguage.googleapis.com/v1beta';
const UPLOAD_API = 'https://generativelanguage.googleapis.com/upload/v1beta/files';

/** Allegato per Gemini: una foto (dentro la richiesta) o un file già caricato (i video, troppo grandi). */
export type GeminiMedia = { mimeType: string; data: string } | { mimeType: string; fileUri: string };

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

type GeminiOptions = {
  model?: string;
  fallbackModels?: string[];
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** solo test: attesa tra i controlli del video in elaborazione */
  pollMs?: number;
};
type JsonOutcome = { ok: true; json: unknown; model: string; usage: { input: number; output: number } } | Failure;

/** Chiamata generica a Gemini che restituisce JSON secondo uno schema. */
function createGeminiJsonClient(apiKey: string, opts: GeminiOptions) {
  const primary = opts.model || DEFAULT_MODEL;
  const models = [primary, ...(opts.fallbackModels ?? DEFAULT_FALLBACK_MODELS).filter((m) => m && m !== primary)];
  const doFetch = opts.fetch ?? fetch;

  // Una richiesta con tempo massimo; il piano gratuito a volte è lento: in quel caso si riprova una volta.
  const call = (model: string, body: string) =>
    doFetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 55_000),
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body,
    });

  // quota finita (429) o modello non disponibile (404): si prova il modello successivo
  type Attempt =
    | JsonOutcome
    | { ok: false; reason: Failure['reason']; tryNext: true }
    | { ok: false; reason: Failure['reason']; thinkingUnsupported: true };

  const generate = async (model: string, body: string): Promise<Attempt> => {
    let res: Response | null = null;
    for (let attempt = 1; attempt <= 2 && !res; attempt++) {
      try {
        res = await call(model, body);
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
      console.error('Gemini API error', model, res.status, errBody.error?.status, errBody.error?.message);
      if (res.status === 429) return { ok: false, reason: 'rate_limited', tryNext: true };
      if (res.status === 404) return { ok: false, reason: 'api_error', tryNext: true };
      if (res.status === 400 && /thinking/i.test(`${errBody.error?.message}`)) {
        return { ok: false, reason: 'api_error', thinkingUnsupported: true };
      }
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

  return async (
    system: string,
    user: string,
    schema: unknown,
    media: GeminiMedia[] = [],
  ): Promise<JsonOutcome> => {
    const request = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{
        role: 'user',
        parts: [
          ...media.map((m) =>
            'fileUri' in m
              ? { fileData: { mimeType: m.mimeType, fileUri: m.fileUri } }
              : { inlineData: { mimeType: m.mimeType, data: m.data } }
          ),
          { text: user },
        ],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature: 0.2,
        maxOutputTokens: 16384,
      },
    };
    // I modelli Flash nuovi "ragionano" a lungo prima di rispondere (anche 30-60 secondi).
    // Per leggere ricette e foto basta poco ragionamento: risposte molto più veloci.
    const fast = JSON.stringify({
      ...request,
      generationConfig: { ...request.generationConfig, thinkingConfig: { thinkingLevel: 'low' } },
    });
    const plain = JSON.stringify(request);

    // stesso sforzo su ogni modello, nell'ordine, finché uno risponde
    let reason: Failure['reason'] | null = null;
    for (const model of models) {
      // i modelli più vecchi non conoscono thinkingLevel: si riprova senza
      let r = await generate(model, fast);
      if (!r.ok && 'thinkingUnsupported' in r) r = await generate(model, plain);
      if (r.ok || !('tryNext' in r)) return r.ok ? r : { ok: false, reason: r.reason };
      // "quota finita" conta più di "modello di riserva non trovato"
      if (reason !== 'rate_limited') reason = r.reason;
    }
    return { ok: false, reason: reason ?? 'api_error' };
  };
}

// ------------------------------------------------------------------ video (File API di Gemini)

type UploadedFile = { name: string; uri: string; mimeType: string };

/**
 * Carica un video su Gemini (caricamento "a riprese", per file grandi), aspetta che sia pronto
 * e restituisce il riferimento da usare nella richiesta. Il file va cancellato dopo (deleteGeminiFile).
 */
export async function uploadGeminiFile(
  apiKey: string,
  video: { mimeType: string; bytes: Uint8Array },
  opts: { fetch?: typeof fetch; pollMs?: number; maxWaitMs?: number } = {},
): Promise<UploadedFile | Failure> {
  const doFetch = opts.fetch ?? fetch;
  try {
    const start = await doFetch(UPLOAD_API, {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        'x-goog-api-key': apiKey,
        'content-type': 'application/json',
        'x-goog-upload-protocol': 'resumable',
        'x-goog-upload-command': 'start',
        'x-goog-upload-header-content-length': String(video.bytes.byteLength),
        'x-goog-upload-header-content-type': video.mimeType,
      },
      body: JSON.stringify({ file: { display_name: 'morso-video' } }),
    });
    const uploadUrl = start.headers.get('x-goog-upload-url');
    await start.body?.cancel();
    if (start.status === 429) return { ok: false, reason: 'rate_limited' };
    if (!start.ok || !uploadUrl) {
      console.error('Gemini upload start failed', start.status);
      return { ok: false, reason: start.status === 401 || start.status === 403 ? 'auth' : 'api_error' };
    }

    const done = await doFetch(uploadUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(90_000),
      headers: { 'x-goog-upload-offset': '0', 'x-goog-upload-command': 'upload, finalize' },
      body: video.bytes as Uint8Array<ArrayBuffer>,
    });
    if (!done.ok) {
      await done.body?.cancel();
      console.error('Gemini upload failed', done.status);
      return { ok: false, reason: 'api_error' };
    }
    let file =
      ((await done.json()) as { file?: { name?: string; uri?: string; state?: string; mimeType?: string } }).file;
    if (!file?.name || !file.uri) return { ok: false, reason: 'api_error' };

    // il video va "elaborato" prima di poterlo usare: si controlla finché è pronto
    const deadline = Date.now() + (opts.maxWaitMs ?? 60_000);
    while (file?.state === 'PROCESSING') {
      if (Date.now() > deadline) {
        await deleteGeminiFile(apiKey, file.name!, doFetch);
        return { ok: false, reason: 'overloaded' };
      }
      await new Promise((r) => setTimeout(r, opts.pollMs ?? 2000));
      const res: Response = await doFetch(`${FILES_API}/${file.name}`, { headers: { 'x-goog-api-key': apiKey } });
      if (!res.ok) {
        await res.body?.cancel();
        break;
      }
      file = { ...file, ...((await res.json()) as typeof file) };
    }
    if (file?.state === 'FAILED') {
      await deleteGeminiFile(apiKey, file.name!, doFetch);
      return { ok: false, reason: 'invalid_output' };
    }
    return { name: file!.name!, uri: file!.uri!, mimeType: file?.mimeType ?? video.mimeType };
  } catch (e) {
    console.error('Gemini upload error', e instanceof Error ? e.name : e);
    return { ok: false, reason: e instanceof Error && e.name === 'TimeoutError' ? 'overloaded' : 'api_error' };
  }
}

/** Cancella il video da Google appena letto (comunque Google lo cancellerebbe da solo dopo 48 ore). */
export async function deleteGeminiFile(apiKey: string, name: string, doFetch: typeof fetch = fetch) {
  try {
    const res = await doFetch(`${FILES_API}/${name}`, { method: 'DELETE', headers: { 'x-goog-api-key': apiKey } });
    await res.body?.cancel();
  } catch {
    // non grave: scade da solo
  }
}

/** Estrae ricetta o locali dal testo di un post. `fetch` nelle opzioni serve solo ai test. */
export function createGeminiExtractor(apiKey: string, opts: GeminiOptions = {}): Extractor {
  // con un video la risposta può arrivare più lentamente: più tempo a disposizione
  const generate = createGeminiJsonClient(apiKey, opts);
  const generateVideo = createGeminiJsonClient(apiKey, { ...opts, timeoutMs: opts.timeoutMs ?? 100_000 });
  return async (input) => {
    let uploaded: UploadedFile | null = null;
    if (input.video) {
      const up = await uploadGeminiFile(apiKey, input.video, { fetch: opts.fetch, pollMs: opts.pollMs });
      if ('ok' in up) return up;
      uploaded = up;
    }
    const media: GeminiMedia[] = uploaded
      ? [{ mimeType: uploaded.mimeType, fileUri: uploaded.uri }]
      : input.image
      ? [input.image]
      : [];
    const r = await (uploaded ? generateVideo : generate)(
      SYSTEM_PROMPT,
      buildUserMessage(input),
      GEMINI_RESPONSE_SCHEMA,
      media,
    ).finally(() => uploaded ? deleteGeminiFile(apiKey, uploaded.name, opts.fetch ?? fetch) : undefined);
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
    async ask(question, catalog) {
      const r = await generate(ASK_SYSTEM_PROMPT, buildAskMessage(question, catalog), GEMINI_ASK_SCHEMA);
      if (!r.ok) return r;
      const parsed = AskSchema.safeParse(r.json);
      if (!parsed.success) return { ok: false, reason: 'invalid_output' };
      return { ok: true, answer: parsed.data, model: r.model, usage: r.usage };
    },
    async fridgeScan(image) {
      const r = await generate(FRIDGE_SCAN_PROMPT, 'Quali alimenti vedi in questa foto?', GEMINI_FRIDGE_SCAN_SCHEMA, [
        image,
      ]);
      if (!r.ok) return r;
      const parsed = FridgeScanSchema.safeParse(r.json);
      if (!parsed.success) return { ok: false, reason: 'invalid_output' };
      return { ok: true, scan: parsed.data, model: r.model, usage: r.usage };
    },
    async shoppingScan(image) {
      const r = await generate(SHOPPING_SCAN_PROMPT, 'Cosa c\'è da comprare in questa lista?', GEMINI_SHOPPING_SCAN_SCHEMA, [image]);
      if (!r.ok) return r;
      const parsed = ShoppingScanSchema.safeParse(r.json);
      if (!parsed.success) return { ok: false, reason: 'invalid_output' };
      return { ok: true, scan: parsed.data, model: r.model, usage: r.usage };
    },
    async fridgeRecipe(request) {
      const r = await generate(FRIDGE_RECIPE_PROMPT, buildFridgeMessage(request), GEMINI_FRIDGE_RECIPE_SCHEMA);
      if (!r.ok) return r;
      const parsed = FridgeRecipeSchema.safeParse(r.json);
      if (!parsed.success) return { ok: false, reason: 'invalid_output' };
      return { ok: true, recipe: parsed.data, model: r.model, usage: r.usage };
    },
    async food(text, image) {
      const r = await generate(FOOD_PROMPT, buildFoodMessage(text), GEMINI_FOOD_SCHEMA, image ? [image] : []);
      if (!r.ok) return r;
      const parsed = FoodSchema.safeParse(r.json);
      if (!parsed.success) return { ok: false, reason: 'invalid_output' };
      return { ok: true, food: parsed.data, model: r.model, usage: r.usage };
    },
  };
}
