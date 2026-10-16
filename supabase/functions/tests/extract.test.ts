import { assertEquals } from 'jsr:@std/assert@1';

import type { Extractor } from '../_shared/ai.ts';
import type { RawExtraction } from '../_shared/extraction.ts';
import type { Geocoder } from '../_shared/geocode.ts';
import { type Deps, handleRequest } from '../extract/handler.ts';
import { fakeFetch, fakeSupabase, html } from './fakes.ts';

const USER = '11111111-1111-1111-1111-111111111111';
const PAGE = 'https://www.ricette.example.it/lasagne';

function post(body: unknown, auth = true) {
  return new Request('https://proj.supabase.co/functions/v1/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer token' } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const web = fakeFetch({
  [PAGE]: html(
    '<meta property="og:title" content="Lasagne alla bolognese"><meta property="og:description" content="Ragù, besciamella e sfoglia fresca: la ricetta della nonna."><meta property="og:image" content="https://cdn.example.it/lasagne.jpg">',
  ),
  'https://cdn.example.it/lasagne.jpg': {
    headers: { 'content-type': 'image/jpeg' },
    body: new Uint8Array([255, 216, 255]),
  },
});

const recipeExtraction: RawExtraction = {
  kind: 'recipe',
  confidence: 'high',
  missing_info: [],
  places: [],
  recipe: {
    title: 'Lasagne alla bolognese',
    description: null,
    servings: 6,
    prep_minutes: 60,
    cook_minutes: 40,
    total_minutes: null,
    tags: ['primo', 'forno'],
    ingredients: [{ quantity: 500, unit: 'g', name: 'sfoglia', note: null, aisle: 'latticini' }],
    steps: [{ text: 'Prepara il ragù.', timer_seconds: null }],
  },
};

const placesExtraction: RawExtraction = {
  kind: 'places',
  confidence: 'high',
  missing_info: [],
  recipe: null,
  places: [
    {
      name: 'Trattoria Anna Maria',
      city: 'Bologna',
      address: null,
      cuisine: 'emiliana',
      recommended_dishes: ['tortellini'],
      price_level: null,
    },
    {
      name: 'Posto Fantasma',
      city: 'Bologna',
      address: null,
      cuisine: null,
      recommended_dishes: [],
      price_level: null,
    },
  ],
};

function deps(
  client: unknown,
  extraction: RawExtraction | null = recipeExtraction,
  extra: Partial<Deps> = {},
): Deps & { aiCalls: number } {
  const state = { aiCalls: 0 };
  const extractor: Extractor = () => {
    state.aiCalls++;
    return Promise.resolve(
      extraction
        ? { ok: true, extraction, model: 'gemini-flash-latest', usage: { input: 1000, output: 200 } }
        : { ok: false, reason: 'refusal' },
    );
  };
  const geocoder: Geocoder = ({ name }) =>
    Promise.resolve(
      name === 'Trattoria Anna Maria'
        ? {
          address: 'Via delle Belle Arti 17, Bologna',
          city: 'Bologna',
          latitude: 44.49,
          longitude: 11.35,
          googlePlaceId: null,
          priceLevel: null,
          provider: 'osm' as const,
        }
        : null,
    );
  return Object.assign(state, {
    fetch: web.fetch,
    supabaseForRequest: () => client as never,
    extractor,
    doseEstimator: null,
    geocoder,
    dailyLimit: 40,
    geocodeDelayMs: 0,
    ...extra,
  });
}

Deno.test('OPTIONS risponde con le intestazioni CORS', async () => {
  const { client } = fakeSupabase({ userId: USER });
  const res = await handleRequest(new Request('https://x/', { method: 'OPTIONS' }), deps(client));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('access-control-allow-origin'), '*');
});

Deno.test('senza accesso → 401', async () => {
  const { client } = fakeSupabase({ userId: null });
  const res = await handleRequest(post({ url: PAGE }), deps(client));
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, 'unauthorized');
});

Deno.test('link mancante o non valido → 400', async () => {
  const { client } = fakeSupabase({ userId: USER });
  const d = deps(client);
  assertEquals((await (await handleRequest(post({ text: 'niente link qui' }), d)).json()).error, 'invalid_url');
  assertEquals((await (await handleRequest(post({ url: 'http://127.0.0.1/' }), d)).json()).error, 'invalid_url');
  assertEquals((await (await handleRequest(post('{rotto'), d)).json()).error, 'invalid_body');
  assertEquals(d.aiCalls, 0);
});

Deno.test("nuovo link: salva, analizza con l'AI e salva la ricetta", async () => {
  const { client, rows, uploads, rpcCalls, statusHistory } = fakeSupabase({ userId: USER });
  const res = await handleRequest(post({ text: `Guarda! ${PAGE}?utm_source=whatsapp` }), deps(client));
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.duplicate, false);
  assertEquals(body.source.url, PAGE);
  assertEquals(body.source.status, 'done');
  assertEquals(body.analysis, { status: 'done', kind: 'recipe', recipeId: 'recipe-1', placeIds: [], missingInfo: [] });
  assertEquals(uploads.length, 1);
  assertEquals(rows.length, 1);
  assertEquals(rpcCalls.map((c) => c.name), ['consume_extraction_quota', 'save_extraction']);
  assertEquals(statusHistory, ['processing', 'done']);
  const saved = rpcCalls[1].args.p_result as { recipe: { total_minutes: number } };
  assertEquals(saved.recipe.total_minutes, 100); // pulito prima del salvataggio
});

Deno.test('post con più locali: verifica gli indirizzi', async () => {
  const { client, rpcCalls } = fakeSupabase({ userId: USER });
  const body = await (await handleRequest(post({ url: PAGE }), deps(client, placesExtraction))).json();
  assertEquals(body.analysis.kind, 'places');
  assertEquals(body.analysis.placeIds, ['place-1', 'place-2']);
  const places = (rpcCalls[1].args.p_result as { places: Record<string, unknown>[] }).places;
  assertEquals(places[0].verified, true);
  assertEquals(places[0].latitude, 44.49);
  assertEquals(places[0].address, 'Via delle Belle Arti 17, Bologna');
  assertEquals(places[1].verified, false); // non trovato: si salva comunque, da completare a mano
  assertEquals(places[1].latitude, null);
});

Deno.test('senza chiave AI: salva il link e basta', async () => {
  const { client } = fakeSupabase({ userId: USER });
  const body = await (await handleRequest(post({ url: PAGE }), deps(client, recipeExtraction, { extractor: null })))
    .json();
  assertEquals(body.source.status, 'pending');
  assertEquals(body.analysis, { status: 'skipped', reason: 'not_configured' });
});

Deno.test("limite giornaliero raggiunto: niente chiamata all'AI", async () => {
  const { client } = fakeSupabase({ userId: USER, quotaAllowed: false });
  const d = deps(client);
  const body = await (await handleRequest(post({ url: PAGE }), d)).json();
  assertEquals(body.analysis, { status: 'skipped', reason: 'quota_exceeded' });
  assertEquals(body.source.status, 'pending');
  assertEquals(d.aiCalls, 0);
});

Deno.test("L'AI rifiuta: il link resta salvato con lo stato di errore", async () => {
  const { client } = fakeSupabase({ userId: USER });
  const body = await (await handleRequest(post({ url: PAGE }), deps(client, null))).json();
  assertEquals(body.analysis, { status: 'error', reason: 'refusal' });
  assertEquals(body.source.status, 'error');
  assertEquals(body.source.error_message, 'ai_refusal');
});

Deno.test('poco testo (Instagram senza caption): chiede il testo, poi la rianalisi funziona', async () => {
  const insta = 'https://www.instagram.com/reel/Cxyz';
  const { client, rows } = fakeSupabase({ userId: USER });
  const d = { ...deps(client), fetch: fakeFetch({}).fetch };
  const first = await (await handleRequest(post({ url: insta }), d)).json();
  assertEquals(first.needsText, true);
  assertEquals(first.analysis, { status: 'skipped', reason: 'needs_text' });
  assertEquals(first.source.status, 'needs_review');

  const second = await (await handleRequest(
    post({
      sourceId: rows[0].id,
      text: 'Lasagne della nonna: sfoglia, ragù, besciamella, parmigiano. Forno 40 minuti.',
    }),
    d,
  )).json();
  assertEquals(second.analysis.status, 'done');
  assertEquals(second.source.shared_text.startsWith('Lasagne della nonna'), true);
});

Deno.test('rianalisi di un link inesistente → 404', async () => {
  const { client } = fakeSupabase({ userId: USER });
  const res = await handleRequest(post({ sourceId: 'non-esiste' }), deps(client));
  assertEquals(res.status, 404);
});

Deno.test('doppione: non rianalizza un link già analizzato', async () => {
  const { client, rows } = fakeSupabase({ userId: USER });
  const d = deps(client);
  await handleRequest(post({ url: PAGE }), d);
  const second = await (await handleRequest(post({ url: `${PAGE}/?utm_campaign=x#top` }), d)).json();
  assertEquals(second.duplicate, true);
  assertEquals(second.analysis, { status: 'skipped', reason: 'already_done' });
  assertEquals(rows.length, 1);
  assertEquals(d.aiCalls, 1);
});

Deno.test("doppione salvato prima dell'AI (Fase 1): viene analizzato adesso", async () => {
  const { client } = fakeSupabase({
    userId: USER,
    rows: [{
      id: 'old',
      url: PAGE,
      platform: 'web',
      title: 'Lasagne',
      description: 'Ragù, besciamella e sfoglia fresca: la ricetta della nonna.',
      author_name: null,
      shared_text: null,
      status: 'pending',
    }],
  });
  const body = await (await handleRequest(post({ url: PAGE }), deps(client))).json();
  assertEquals(body.duplicate, true);
  assertEquals(body.analysis.status, 'done');
});

Deno.test('errore nel salvataggio: stato "error", nessun crash', async () => {
  const { client } = fakeSupabase({ userId: USER, saveFails: true });
  const body = await (await handleRequest(post({ url: PAGE }), deps(client))).json();
  assertEquals(body.analysis, { status: 'error', reason: 'save_failed' });
  assertEquals(body.source.status, 'error');
});

const jsonLdPage = (page: string, recipe: Record<string, unknown>) =>
  fakeFetch({
    [page]: html(`<title>Ricetta</title><script type="application/ld+json">${JSON.stringify(recipe)}</script>`),
  }).fetch;

Deno.test('sito con scheda ricetta in italiano: niente AI, niente limite consumato', async () => {
  const page = 'https://www.ricette.example.it/tiramisu';
  const { client, rpcCalls } = fakeSupabase({ userId: USER });
  const d = deps(client);
  d.fetch = jsonLdPage(page, {
    '@type': 'Recipe',
    name: 'Tiramisù',
    recipeIngredient: ['500 g mascarpone', '4 uova'],
    recipeInstructions: 'Monta le uova.\nAggiungi il mascarpone.',
  });
  const body = await (await handleRequest(post({ url: page }), d)).json();
  assertEquals(body.analysis.status, 'done');
  assertEquals(body.analysis.kind, 'recipe');
  assertEquals(d.aiCalls, 0);
  assertEquals(rpcCalls.map((c) => c.name), ['save_extraction']);
  assertEquals((rpcCalls[0].args.p_ai_result as { model: string }).model, 'schema.org');
});

Deno.test("scheda ricetta in inglese: la traduce l'AI", async () => {
  const page = 'https://www.recipes.example.com/brownies';
  const { client } = fakeSupabase({ userId: USER });
  const d = deps(client);
  d.fetch = jsonLdPage(page, {
    '@type': 'Recipe',
    inLanguage: 'en',
    name: 'Brownies',
    recipeIngredient: ['1 cup sugar'],
  });
  await handleRequest(post({ url: page }), d);
  assertEquals(d.aiCalls, 1);
});

Deno.test('senza chiave AI la scheda ricetta funziona lo stesso (anche in inglese)', async () => {
  const page = 'https://www.recipes.example.com/brownies';
  const { client } = fakeSupabase({ userId: USER });
  const d = deps(client, recipeExtraction, { extractor: null });
  d.fetch = jsonLdPage(page, {
    '@type': 'Recipe',
    inLanguage: 'en',
    name: 'Brownies',
    recipeIngredient: ['1 cup sugar'],
  });
  const body = await (await handleRequest(post({ url: page }), d)).json();
  assertEquals(body.analysis.status, 'needs_review'); // niente passaggi → da completare
  assertEquals(body.analysis.kind, 'recipe');
});

// ---------------------------------------------------------------- stima delle dosi

function doseFake(recipe: Record<string, unknown> | null, quotaAllowed = true) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: USER } }, error: null }) },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: () => Promise.resolve({ data: recipe, error: null }),
      };
      return q;
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: name === 'consume_extraction_quota' ? quotaAllowed : null, error: null });
    },
  };
  return { client, rpcCalls };
}

const recipeRow = {
  id: 'r1',
  title: 'Frittata di zucchine',
  description: null,
  servings: null,
  servings_estimated: false,
  prep_minutes: 5,
  cook_minutes: 10,
  total_minutes: 15,
  tags: ['secondo'],
  recipe_ingredients: [
    {
      position: 1,
      quantity: null,
      unit: null,
      name: 'zucchine',
      note: null,
      aisle: 'frutta_verdura',
      estimated: false,
    },
    { position: 0, quantity: 4, unit: null, name: 'uova', note: null, aisle: 'latticini', estimated: false },
    { position: 2, quantity: null, unit: null, name: 'sale', note: 'q.b.', aisle: 'dispensa', estimated: false },
  ],
  recipe_steps: [{ position: 0, text: 'Sbatti le uova.', timer_seconds: null }],
};

Deno.test('stima dosi: completa quelle mancanti e le salva come stimate', async () => {
  const { client, rpcCalls } = doseFake(recipeRow);
  const d = deps(client);
  d.doseEstimator = (input) => {
    // l'ordine segue la posizione: 0 = uova, 1 = zucchine
    assertEquals(input.ingredients.map((i) => i.name), ['uova', 'zucchine', 'sale']);
    return Promise.resolve({
      ok: true,
      estimate: { servings: 2, ingredients: [{ index: 1, quantity: 2, unit: null }] },
      model: 'gemini',
      usage: { input: 1, output: 1 },
    });
  };
  const res = await (await handleRequest(post({ action: 'estimate_doses', recipeId: 'r1' }), d)).json();
  assertEquals(res, { recipeId: 'r1', status: 'done', changed: 1, servings: 2 });
  const saved = rpcCalls.find((c) => c.name === 'update_recipe')!.args.p_recipe as {
    servings: number;
    servings_estimated: boolean;
    ingredients: Record<string, unknown>[];
    steps: unknown[];
  };
  assertEquals(saved.servings, 2);
  assertEquals(saved.servings_estimated, true);
  assertEquals(saved.ingredients[1], {
    quantity: 2,
    unit: null,
    name: 'zucchine',
    note: null,
    estimated: true,
    aisle: 'frutta_verdura',
  });
  assertEquals(saved.ingredients[2].quantity, null); // sale resta q.b.
  assertEquals(saved.steps.length, 1);
});

Deno.test('stima dosi: niente da fare se le dosi ci sono già', async () => {
  const complete = {
    ...recipeRow,
    servings: 2,
    recipe_ingredients: [{
      position: 0,
      quantity: 4,
      unit: null,
      name: 'uova',
      note: null,
      aisle: 'latticini',
      estimated: false,
    }],
  };
  const { client, rpcCalls } = doseFake(complete);
  const res = await (await handleRequest(post({ action: 'estimate_doses', recipeId: 'r1' }), deps(client))).json();
  assertEquals(res, { recipeId: 'r1', status: 'nothing_to_do' });
  assertEquals(rpcCalls.length, 0);
});

Deno.test('stima dosi: senza AI o oltre il limite → messaggio, nessuna modifica', async () => {
  const a = doseFake(recipeRow);
  assertEquals(await (await handleRequest(post({ action: 'estimate_doses', recipeId: 'r1' }), deps(a.client))).json(), {
    recipeId: 'r1',
    status: 'skipped',
    reason: 'not_configured',
  });
  const b = doseFake(recipeRow, false);
  const d = deps(b.client);
  d.doseEstimator = () => Promise.reject(new Error('non deve essere chiamato'));
  assertEquals(
    (await (await handleRequest(post({ action: 'estimate_doses', recipeId: 'r1' }), d)).json()).reason,
    'quota_exceeded',
  );
});

Deno.test('stima dosi: ricetta inesistente o richiesta sbagliata', async () => {
  const { client } = doseFake(null);
  assertEquals(
    (await (await handleRequest(post({ action: 'estimate_doses', recipeId: 'x' }), deps(client))).json()).reason,
    'not_found',
  );
  assertEquals((await handleRequest(post({ action: 'estimate_doses' }), deps(client))).status, 400);
});
