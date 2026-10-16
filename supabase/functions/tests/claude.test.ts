// Test della chiamata a Claude con risposte dell'API simulate (nessun costo, nessuna rete).
import { assertEquals } from 'jsr:@std/assert@1';

import { createClaudeExtractor, MODEL } from '../_shared/claude.ts';
import type { ExtractionInput } from '../_shared/extraction.ts';

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

function apiReply(body: unknown, status = 200): { fetch: typeof fetch; requests: Record<string, unknown>[] } {
  const requests: Record<string, unknown>[] = [];
  const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body ?? '{}')));
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', 'request-id': 'req_test' },
      }),
    );
  }) as typeof fetch;
  return { fetch: fetchImpl, requests };
}

const message = (content: unknown[], stop_reason = 'end_turn') => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: MODEL,
  content,
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 1200, output_tokens: 300 },
});

Deno.test('risposta valida → dati estratti', async () => {
  const api = apiReply(message([{ type: 'text', text: JSON.stringify(extraction) }]));
  const outcome = await createClaudeExtractor('sk-test', api.fetch)(input);
  assertEquals(outcome.ok, true);
  if (outcome.ok) {
    assertEquals(outcome.extraction.recipe?.title, 'Pasta al limone');
    assertEquals(outcome.usage, { input: 1200, output: 300 });
  }
  // Controlla cosa mandiamo all'API: modello Sonnet, schema JSON, sforzo basso, fallback
  const sent = api.requests[0];
  assertEquals(sent.model, 'claude-sonnet-5-5');
  assertEquals((sent.output_config as { effort: string }).effort, 'low');
  assertEquals((sent.output_config as { format: { type: string } }).format.type, 'json_schema');
  assertEquals(sent.fallbacks, 'default');
});

Deno.test('rifiuto per sicurezza → refusal', async () => {
  const api = apiReply(message([], 'refusal'));
  assertEquals(await createClaudeExtractor('sk-test', api.fetch)(input), { ok: false, reason: 'refusal' });
});

Deno.test('risposta tagliata → truncated', async () => {
  const api = apiReply(message([{ type: 'text', text: '{"kind":"rec' }], 'max_tokens'));
  assertEquals(await createClaudeExtractor('sk-test', api.fetch)(input), { ok: false, reason: 'truncated' });
});

Deno.test('JSON che non rispetta lo schema → invalid_output', async () => {
  const api = apiReply(message([{ type: 'text', text: '{"kind":"recipe"}' }]));
  assertEquals(await createClaudeExtractor('sk-test', api.fetch)(input), { ok: false, reason: 'invalid_output' });
});

Deno.test('chiave API sbagliata → auth', async () => {
  const api = apiReply({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401);
  assertEquals(await createClaudeExtractor('sk-bad', api.fetch)(input), { ok: false, reason: 'auth' });
});

Deno.test('troppe richieste → rate_limited', async () => {
  const api = apiReply({ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, 429);
  assertEquals(await createClaudeExtractor('sk-test', api.fetch)(input), { ok: false, reason: 'rate_limited' });
});
