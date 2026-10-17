import { assert, assertEquals } from 'jsr:@std/assert@1';

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
          phone: '+39 051 266894',
          website: null,
          openingHours: 'Tu-Su 12:30-15:00',
          provider: 'osm' as const,
        }
        : null,
    );
  return Object.assign(state, {
    fetch: web.fetch,
    supabaseForRequest: () => client as never,
    extractor,
    doseEstimator: null,
    recipeTools: null,
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
  assertEquals(places[0].phone, '+39 051 266894');
  assertEquals(places[0].opening_hours, 'Tu-Su 12:30-15:00');
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

// ---------------------------------------------------------------- foto, valori, varianti, locali

const tools = (calls: string[]) => ({
  insights: () => {
    calls.push('insights');
    return Promise.resolve({
      ok: true as const,
      insights: { kcal_per_serving: 610, protein_g: 25, carbs_g: 60, fat_g: 30, difficulty: 'media', cost_level: 2 },
      model: 'gemini',
      usage: { input: 1, output: 1 },
    });
  },
  variant: (_r: unknown, kind: string) => {
    calls.push(`variant:${kind}`);
    return Promise.resolve({
      ok: true as const,
      variant: {
        title: 'Frittata vegana',
        changes: ['uova → farina di ceci'],
        servings: 2,
        prep_minutes: 5,
        cook_minutes: 10,
        ingredients: [{ quantity: 150, unit: 'g', name: 'farina di ceci', note: null, aisle: 'dispensa' }],
        steps: [{ text: 'Mescola la farina con acqua.', timer_seconds: null }],
      },
      model: 'gemini',
      usage: { input: 1, output: 1 },
    });
  },
  fridgeScan: (image: { mimeType: string }) => {
    calls.push(`scan:${image.mimeType}`);
    return Promise.resolve({
      ok: true as const,
      scan: { ingredients: ['Uova', 'zucchine', 'uova', ' parmigiano. '] },
      model: 'gemini',
      usage: { input: 1, output: 1 },
    });
  },
  fridgeRecipe: (request: { ingredients: string[]; avoid: string[] }) => {
    calls.push(`recipe:${request.ingredients.join(',')}|evita:${request.avoid.join(',')}`);
    return Promise.resolve({
      ok: true as const,
      recipe: {
        title: 'Frittata di zucchine al parmigiano',
        description: 'Pronta in 20 minuti',
        servings: 2,
        prep_minutes: 5,
        cook_minutes: 15,
        tags: ['secondo', 'vegetariano', 'inventato'],
        uses: ['uova', 'zucchine', 'parmigiano'],
        missing: [],
        ingredients: [{ quantity: 4, unit: null, name: 'uova', note: null, aisle: 'latticini' }],
        steps: [{ text: 'Sbatti le uova.', timer_seconds: null }],
      },
      model: 'gemini',
      usage: { input: 1, output: 1 },
    });
  },
  ask: (question: string, catalog: string) => {
    calls.push(`ask:${question}`);
    calls.push(catalog);
    return Promise.resolve({
      ok: true as const,
      answer: {
        message: 'Ecco cosa ti propongo',
        items: [{ ref: 'R1', reason: 'veloce' }, { ref: 'R99', reason: 'inventata' }, { ref: 'p1', reason: 'vicino' }],
      },
      model: 'gemini',
      usage: { input: 1, output: 1 },
    });
  },
});

Deno.test("foto di una ricetta: salvata nello storage e letta dall'AI", async () => {
  const { client, rows, uploads } = fakeSupabase({ userId: USER });
  const d = deps(client);
  let seenImage: unknown = null;
  d.extractor = (input) => {
    seenImage = input.image;
    return Promise.resolve({ ok: true, extraction: recipeExtraction, model: 'gemini', usage: { input: 1, output: 1 } });
  };
  const res = await handleRequest(
    post({ imageBase64: btoa('immagine finta'), mimeType: 'image/jpeg', text: 'dal libro della nonna' }),
    d,
  );
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.analysis.kind, 'recipe');
  assertEquals(uploads.length, 1);
  assertEquals(rows[0].platform, 'manual');
  assertEquals(rows[0].shared_text, 'dal libro della nonna');
  assertEquals((seenImage as { mimeType: string }).mimeType, 'image/jpeg');
});

Deno.test('foto: formato non valido → 400', async () => {
  const { client } = fakeSupabase({ userId: USER });
  const res = await handleRequest(post({ imageBase64: btoa('x'), mimeType: 'application/pdf' }), deps(client));
  assertEquals((await res.json()).error, 'invalid_image');
});

Deno.test("sito con scheda ricetta: difficoltà e costo stimati dall'AI, calorie del sito", async () => {
  const page = 'https://www.ricette.example.it/lasagne-forno';
  const { client, rpcCalls } = fakeSupabase({ userId: USER });
  const calls: string[] = [];
  const d = deps(client);
  d.recipeTools = tools(calls);
  d.fetch = jsonLdPage(page, {
    '@type': 'Recipe',
    name: 'Lasagne',
    recipeIngredient: ['500 g sfoglia'],
    recipeInstructions: 'Inforna.',
    nutrition: { calories: '540 kcal' },
  });
  await handleRequest(post({ url: page }), d);
  assertEquals(calls, ['insights']);
  const saved = rpcCalls.find((c) => c.name === 'save_extraction')!.args.p_result as {
    recipe: { insights: Record<string, unknown> };
  };
  assertEquals(saved.recipe.insights.kcal_per_serving, 540); // quelle del sito vincono
  assertEquals(saved.recipe.insights.difficulty, 'media');
  assertEquals(saved.recipe.insights.cost_level, 2);
});

function actionFake(tables: Record<string, Record<string, unknown> | null>) {
  const updates: { table: string; patch: Record<string, unknown> }[] = [];
  const client = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: USER } }, error: null }) },
    from: (table: string) => {
      let patch: Record<string, unknown> | null = null;
      const q = {
        select: () => q,
        eq: () => q,
        update: (p: Record<string, unknown>) => ((patch = p), q),
        maybeSingle: () => Promise.resolve({ data: tables[table] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => {
          if (patch) updates.push({ table, patch });
          resolve({ error: null });
        },
      };
      return q;
    },
    rpc: () => Promise.resolve({ data: true, error: null }),
  };
  return { client, updates };
}

Deno.test('valori della ricetta: calcolati e salvati', async () => {
  const { client, updates } = actionFake({ recipes: recipeRow });
  const d = deps(client);
  d.recipeTools = tools([]);
  const res = await (await handleRequest(post({ action: 'recipe_insights', recipeId: 'r1' }), d)).json();
  assertEquals(res.status, 'done');
  assertEquals(res.insights.kcal_per_serving, 610);
  assertEquals(updates[0].table, 'recipes');
  assertEquals(updates[0].patch.difficulty, 'media');
  assertEquals(typeof updates[0].patch.insights_at, 'string');
});

Deno.test('variante: proposta ma NON salvata', async () => {
  const { client, updates } = actionFake({ recipes: recipeRow });
  const calls: string[] = [];
  const d = deps(client);
  d.recipeTools = tools(calls);
  const res = await (await handleRequest(post({ action: 'recipe_variant', recipeId: 'r1', kind: 'vegana' }), d)).json();
  assertEquals(res.status, 'done');
  assertEquals(res.variant.title, 'Frittata vegana');
  assertEquals(res.variant.kind, 'vegana');
  assertEquals(calls, ['variant:vegana']);
  assertEquals(updates.length, 0);
  const bad = await handleRequest(post({ action: 'recipe_variant', recipeId: 'r1', kind: 'marziana' }), d);
  assertEquals(bad.status, 400);
});

Deno.test('senza AI: valori e varianti non disponibili', async () => {
  const { client } = actionFake({ recipes: recipeRow });
  const res = await (await handleRequest(post({ action: 'recipe_insights', recipeId: 'r1' }), deps(client))).json();
  assertEquals(res, { status: 'skipped', reason: 'not_configured' });
});

Deno.test('aggiorna locale: telefono, sito e orari', async () => {
  const { client, updates } = actionFake({
    places: {
      id: 'p1',
      name: 'Trattoria Anna Maria',
      city: 'Bologna',
      address: null,
      phone: null,
      website: null,
      opening_hours: null,
    },
  });
  const res = await (await handleRequest(post({ action: 'refresh_place', placeId: 'p1' }), deps(client))).json();
  assertEquals(res, { status: 'done' });
  assertEquals(updates[0].patch.phone, '+39 051 266894');
  assertEquals(updates[0].patch.verified, true);
  assertEquals(updates[0].patch.latitude, 44.49);
});

function listFake(tables: Record<string, unknown[]>, quota = true) {
  const client = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: USER } }, error: null }) },
    from: (table: string) => {
      const q = {
        select: () => q,
        order: () => q,
        limit: () => Promise.resolve({ data: tables[table] ?? [], error: null }),
      };
      return q;
    },
    rpc: () => Promise.resolve({ data: quota, error: null }),
  };
  return client;
}

const libraryTables = {
  recipes: [{
    id: 'rec-1',
    title: 'Pollo al limone',
    tags: ['secondo'],
    total_minutes: 20,
    kcal_per_serving: 400,
    difficulty: 'facile',
    recipe_ingredients: [{ name: 'pollo' }],
  }],
  places: [{
    id: 'pl-1',
    name: 'Sushi Bar',
    city: 'Milano',
    cuisine: 'giapponese',
    price_level: 2,
    recommended_dishes: [],
    wishlist: true,
  }],
};

Deno.test("chiedi all'AI: sceglie solo tra le cose salvate", async () => {
  const calls: string[] = [];
  const d = deps(listFake(libraryTables));
  d.recipeTools = tools(calls);
  const res = await (await handleRequest(post({ action: 'ask_library', question: 'qualcosa di veloce' }), d)).json();
  assertEquals(res.status, 'done');
  assertEquals(res.message, 'Ecco cosa ti propongo');
  assertEquals(res.items, [
    { type: 'recipe', id: 'rec-1', reason: 'veloce' },
    { type: 'place', id: 'pl-1', reason: 'vicino' },
  ]); // R99 non esiste → scartata
  assertEquals(calls[0], 'ask:qualcosa di veloce');
  assert(calls[1].includes('R1 | Pollo al limone') && calls[1].includes('P1 | Sushi Bar'));
  assert(!calls[1].includes('rec-1'), "gli id veri non arrivano all'AI");
});

Deno.test("chiedi all'AI: libreria vuota, limite, domanda non valida", async () => {
  const d = deps(listFake({}));
  d.recipeTools = tools([]);
  assertEquals(
    (await (await handleRequest(post({ action: 'ask_library', question: 'ciao' }), d)).json()).status,
    'empty',
  );
  const d2 = deps(listFake(libraryTables, false));
  d2.recipeTools = tools([]);
  assertEquals(await (await handleRequest(post({ action: 'ask_library', question: 'ciao' }), d2)).json(), {
    status: 'skipped',
    reason: 'quota_exceeded',
  });
  assertEquals((await handleRequest(post({ action: 'ask_library', question: 'x'.repeat(301) }), d)).status, 400);
  assertEquals((await handleRequest(post({ action: 'ask_library' }), d)).status, 400);
});

function videoFake(recipe: Record<string, unknown> | null, opts: { quota?: boolean; download?: boolean } = {}) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const storage: string[] = [];
  const client = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: USER } }, error: null }) },
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: () =>
          Promise.resolve({
            data: table === 'recipes' ? recipe : {
              url: 'https://www.tiktok.com/@chef/video/1',
              platform: 'tiktok',
              title: 'Frittata!',
              description: 'frittata facile',
              author_name: 'chef',
              shared_text: null,
            },
            error: null,
          }),
      };
      return q;
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: name === 'consume_extraction_quota' ? opts.quota ?? true : null, error: null });
    },
    storage: {
      from: (bucket: string) => ({
        download: (path: string) => {
          storage.push(`download ${bucket}/${path}`);
          return Promise.resolve(
            opts.download === false
              ? { data: null, error: { message: 'not found' } }
              : { data: new Blob([new Uint8Array(2048)], { type: 'video/mp4' }), error: null },
          );
        },
        remove: (paths: string[]) => {
          storage.push(`remove ${bucket}/${paths.join(',')}`);
          return Promise.resolve({ data: null, error: null });
        },
      }),
    },
  };
  return { client, rpcCalls, storage };
}

const VIDEO = `${USER}/22222222-2222-4222-8222-222222222222.mp4`;
const videoExtraction: RawExtraction = {
  ...recipeExtraction,
  recipe: {
    ...recipeExtraction.recipe!,
    ingredients: [
      { quantity: 4, unit: null, name: 'uova', note: null, aisle: 'latticini', estimated: false },
      { quantity: 2, unit: null, name: 'zucchine', note: null, aisle: 'frutta_verdura', estimated: false },
      { quantity: 30, unit: 'g', name: 'parmigiano', note: null, aisle: 'latticini', estimated: false },
    ],
    steps: [
      { text: 'Affetta le zucchine e rosolale.', timer_seconds: 300 },
      { text: 'Sbatti le uova col parmigiano.', timer_seconds: null },
      { text: 'Cuoci la frittata coperta.', timer_seconds: 480 },
    ],
  },
};

Deno.test('video: procedimento letto dal video, stessa ricetta aggiornata, video cancellato', async () => {
  const { client, rpcCalls, storage } = videoFake({ ...recipeRow, source_id: 's1' });
  const d = deps(client);
  let seen: { video?: { mimeType: string; bytes: Uint8Array } | null; description: string | null } | null = null;
  d.extractor = (input) => {
    seen = input;
    return Promise.resolve({ ok: true, extraction: videoExtraction, model: 'gemini', usage: { input: 1, output: 1 } });
  };
  const res = await (await handleRequest(post({ action: 'recipe_video', recipeId: 'r1', videoPath: VIDEO }), d)).json();
  assertEquals(res, { status: 'done', changed: ['steps', 'ingredients'] });
  assertEquals(seen!.video!.mimeType, 'video/mp4');
  assertEquals(seen!.video!.bytes.byteLength, 2048);
  assertEquals(seen!.description, 'frittata facile'); // la caption del TikTok aiuta l'AI
  const update = rpcCalls.find((c) => c.name === 'update_recipe')!;
  assertEquals(update.args.p_recipe_id, 'r1');
  const recipe = update.args.p_recipe as { title: string; steps: unknown[]; ingredients: { name: string }[] };
  assertEquals(recipe.title, 'Frittata di zucchine');
  assertEquals(recipe.steps.length, 3);
  assertEquals(recipe.ingredients.map((i) => i.name), ['uova', 'zucchine', 'parmigiano']);
  assertEquals(storage, [`download videos/${VIDEO}`, `remove videos/${VIDEO}`]);
});

Deno.test('video di un altro utente o percorso strano → rifiutato, nessuna lettura', async () => {
  const { client, storage } = videoFake(recipeRow);
  const d = deps(client);
  for (
    const path of ['33333333-3333-4333-8333-333333333333/22222222-2222-4222-8222-222222222222.mp4', `${USER}/../x.mp4`]
  ) {
    const res = await (await handleRequest(post({ action: 'recipe_video', recipeId: 'r1', videoPath: path }), d))
      .json();
    assertEquals(res, { status: 'error', reason: 'invalid_video' });
  }
  assertEquals(storage, []);
  assertEquals((await handleRequest(post({ action: 'recipe_video', recipeId: 'r1' }), d)).status, 400);
});

Deno.test('video: limite giornaliero raggiunto → niente AI, ma il video si cancella', async () => {
  const { client, storage } = videoFake(recipeRow, { quota: false });
  const d = deps(client);
  const res = await (await handleRequest(post({ action: 'recipe_video', recipeId: 'r1', videoPath: VIDEO }), d)).json();
  assertEquals(res, { status: 'skipped', reason: 'quota_exceeded' });
  assertEquals(d.aiCalls, 0);
  assertEquals(storage, [`remove videos/${VIDEO}`]);
});

Deno.test('frigo: dalla foto agli alimenti (puliti, senza doppioni)', async () => {
  const calls: string[] = [];
  const d = deps(actionFake({}).client);
  d.recipeTools = tools(calls);
  const res =
    await (await handleRequest(post({ action: 'fridge_scan', imageBase64: btoa('foto'), mimeType: 'image/jpeg' }), d))
      .json();
  assertEquals(res, { status: 'done', ingredients: ['uova', 'zucchine', 'parmigiano'] });
  assertEquals(calls, ['scan:image/jpeg']);
  const bad = await handleRequest(
    post({ action: 'fridge_scan', imageBase64: btoa('x'), mimeType: 'application/pdf' }),
    d,
  );
  assertEquals(bad.status, 400);
  const notBase64 = await handleRequest(
    post({ action: 'fridge_scan', imageBase64: '<script>', mimeType: 'image/png' }),
    d,
  );
  assertEquals(notBase64.status, 400);
});

Deno.test('frigo: ricetta nuova dagli ingredienti, etichette non ammesse tolte', async () => {
  const calls: string[] = [];
  const d = deps(actionFake({}).client);
  d.recipeTools = tools(calls);
  const res = await (await handleRequest(
    post({
      action: 'fridge_recipe',
      ingredients: ['uova', ' zucchine ', 'uova', 42],
      servings: 2,
      avoid: ['Frittata semplice'],
    }),
    d,
  )).json();
  assertEquals(res.status, 'done');
  assertEquals(res.recipe.title, 'Frittata di zucchine al parmigiano');
  assertEquals(res.recipe.total_minutes, 20);
  assertEquals(res.recipe.tags, ['secondo', 'vegetariano']);
  assertEquals(calls, ['recipe:uova,zucchine|evita:Frittata semplice']);
  assertEquals((await handleRequest(post({ action: 'fridge_recipe', ingredients: [] }), d)).status, 400);
  assertEquals((await handleRequest(post({ action: 'fridge_recipe', ingredients: 'uova' }), d)).status, 400);
});

Deno.test('frigo: senza AI o oltre il limite giornaliero', async () => {
  const d = deps(actionFake({}).client);
  const res = await (await handleRequest(post({ action: 'fridge_recipe', ingredients: ['uova'] }), d)).json();
  assertEquals(res, { status: 'skipped', reason: 'not_configured' });
});
