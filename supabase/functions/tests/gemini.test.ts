// Test della chiamata a Gemini con risposte dell'API simulate (nessun costo, nessuna rete).
import { assertEquals } from 'jsr:@std/assert@1';

import type { ExtractionInput } from '../_shared/extraction.ts';
import { createGeminiExtractor, DEFAULT_MODEL } from '../_shared/gemini.ts';

const input: ExtractionInput = {
  url: 'https://www.tiktok.com/@chef/video/1',
  platform: 'tiktok',
  title: 'Pasta al limone',
  description: '160 g spaghetti, 1 limone, burro, parmigiano. Cuoci la pasta 10 minuti e manteca.',
  author: 'Chef',
  sharedText: null,
  recipeJsonLd: null,
};

const extraction = {
  kind: 'recipe',
  confidence: 'high',
  missing_info: [],
  places: [],
  recipe: {
    title: 'Pasta al limone',
    description: null,
    servings: 1,
    prep_minutes: null,
    cook_minutes: 10,
    total_minutes: null,
    tags: ['primo', 'veloce'],
    ingredients: [{ quantity: 160, unit: 'g', name: 'spaghetti', note: null, aisle: 'dispensa' }],
    steps: [{ text: 'Cuoci la pasta.', timer_seconds: 600 }],
  },
};

function api(body: unknown, status = 200) {
  const requests: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body ?? '{}')),
    });
    return Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
    );
  }) as typeof fetch;
  return { fetch: fetchImpl, requests };
}

const reply = (text: string, finishReason = 'STOP', extraParts: unknown[] = []) => ({
  candidates: [{ content: { role: 'model', parts: [...extraParts, { text }] }, finishReason }],
  usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 250 },
  modelVersion: 'gemini-x-flash',
});

Deno.test('risposta valida → dati estratti, richiesta corretta', async () => {
  const a = api(reply(JSON.stringify(extraction)));
  const outcome = await createGeminiExtractor('key-123', { fetch: a.fetch })(input);
  assertEquals(outcome.ok, true);
  if (outcome.ok) {
    assertEquals(outcome.extraction.recipe?.title, 'Pasta al limone');
    assertEquals(outcome.model, 'gemini-x-flash');
    assertEquals(outcome.usage, { input: 900, output: 250 });
  }
  const sent = a.requests[0];
  assertEquals(sent.url, `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`);
  assertEquals(sent.headers.get('x-goog-api-key'), 'key-123'); // la chiave va nell'intestazione, non nell'indirizzo
  const config = sent.body.generationConfig as { responseMimeType: string; responseSchema: { type: string } };
  assertEquals(config.responseMimeType, 'application/json');
  assertEquals(config.responseSchema.type, 'OBJECT');
});

Deno.test('ignora le parti di "ragionamento" del modello', async () => {
  const a = api(reply(JSON.stringify(extraction), 'STOP', [{ text: 'sto pensando…', thought: true }]));
  const outcome = await createGeminiExtractor('k', { fetch: a.fetch })(input);
  assertEquals(outcome.ok, true);
});

Deno.test('campi mancanti nella risposta → riempiti, non scartati', async () => {
  const a = api(reply(JSON.stringify({ kind: 'places', places: [{ name: 'Da Gino', city: 'Genova' }] })));
  const outcome = await createGeminiExtractor('k', { fetch: a.fetch })(input);
  assertEquals(outcome.ok, true);
  if (outcome.ok) assertEquals(outcome.extraction.places[0].recommended_dishes, []);
});

Deno.test('modello personalizzato', async () => {
  const a = api(reply(JSON.stringify(extraction)));
  await createGeminiExtractor('k', { fetch: a.fetch, model: 'gemini-2.5-flash-lite' })(input);
  assertEquals(a.requests[0].url.includes('/models/gemini-2.5-flash-lite:generateContent'), true);
});

Deno.test('bloccato per sicurezza → refusal', async () => {
  assertEquals(await createGeminiExtractor('k', { fetch: api(reply('', 'SAFETY')).fetch })(input), {
    ok: false,
    reason: 'refusal',
  });
  assertEquals(
    await createGeminiExtractor('k', { fetch: api({ promptFeedback: { blockReason: 'OTHER' } }).fetch })(input),
    { ok: false, reason: 'refusal' },
  );
});

Deno.test('risposta tagliata → truncated', async () => {
  assertEquals(await createGeminiExtractor('k', { fetch: api(reply('{"kind":"rec', 'MAX_TOKENS')).fetch })(input), {
    ok: false,
    reason: 'truncated',
  });
});

Deno.test('testo che non è JSON → invalid_output', async () => {
  assertEquals(await createGeminiExtractor('k', { fetch: api(reply('Ecco la ricetta!')).fetch })(input), {
    ok: false,
    reason: 'invalid_output',
  });
});

Deno.test("errori dell'API", async () => {
  const run = (status: number, error: unknown) =>
    createGeminiExtractor('k', { fetch: api({ error }, status).fetch })(input);
  assertEquals(await run(429, { status: 'RESOURCE_EXHAUSTED', message: 'quota' }), {
    ok: false,
    reason: 'rate_limited',
  });
  assertEquals(
    await run(400, { status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' }),
    {
      ok: false,
      reason: 'auth',
    },
  );
  assertEquals(await run(403, { status: 'PERMISSION_DENIED', message: 'denied' }), { ok: false, reason: 'auth' });
  assertEquals(await run(503, { status: 'UNAVAILABLE', message: 'overloaded' }), { ok: false, reason: 'overloaded' });
  assertEquals(await run(400, { status: 'INVALID_ARGUMENT', message: 'bad schema' }), {
    ok: false,
    reason: 'api_error',
  });
});

Deno.test('rete assente → api_error (nessun crash)', async () => {
  const failing = (() => Promise.reject(new TypeError('network'))) as typeof fetch;
  assertEquals(await createGeminiExtractor('k', { fetch: failing })(input), { ok: false, reason: 'api_error' });
});
