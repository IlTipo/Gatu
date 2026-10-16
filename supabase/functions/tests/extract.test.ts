import { assertEquals } from 'jsr:@std/assert@1';

import { handleRequest } from '../extract/handler.ts';
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

Deno.test('OPTIONS risponde con le intestazioni CORS', async () => {
  const { client } = fakeSupabase({ userId: USER });
  const res = await handleRequest(new Request('https://x/', { method: 'OPTIONS' }), {
    fetch: web.fetch,
    supabaseForRequest: () => client as never,
  });
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('access-control-allow-origin'), '*');
});

Deno.test('senza accesso → 401', async () => {
  const { client } = fakeSupabase({ userId: null });
  const res = await handleRequest(post({ url: PAGE }), { fetch: web.fetch, supabaseForRequest: () => client as never });
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, 'unauthorized');
});

Deno.test('link mancante o non valido → 400', async () => {
  const { client } = fakeSupabase({ userId: USER });
  const deps = { fetch: web.fetch, supabaseForRequest: () => client as never };
  assertEquals((await (await handleRequest(post({ text: 'niente link qui' }), deps)).json()).error, 'invalid_url');
  assertEquals((await (await handleRequest(post({ url: 'http://127.0.0.1/' }), deps)).json()).error, 'invalid_url');
  assertEquals((await (await handleRequest(post('{rotto'), deps)).json()).error, 'invalid_body');
});

Deno.test('salva il link con metadati e copia la miniatura', async () => {
  const { client, rows, uploads } = fakeSupabase({ userId: USER });
  const res = await handleRequest(post({ text: `Guarda! ${PAGE}?utm_source=whatsapp` }), {
    fetch: web.fetch,
    supabaseForRequest: () => client as never,
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.duplicate, false);
  assertEquals(body.source.url, PAGE);
  assertEquals(body.source.title, 'Lasagne alla bolognese');
  assertEquals(body.source.platform, 'web');
  assertEquals(body.source.status, 'pending');
  assertEquals(body.source.shared_text, `Guarda! ${PAGE}?utm_source=whatsapp`);
  assertEquals(uploads.length, 1);
  assertEquals(uploads[0].startsWith(`${USER}/`), true);
  assertEquals(body.source.thumbnail_url.includes('/storage/v1/object/public/images/'), true);
  assertEquals(rows.length, 1);
});

Deno.test('lo stesso link salvato due volte non crea doppioni', async () => {
  const { client, rows } = fakeSupabase({ userId: USER });
  const deps = { fetch: web.fetch, supabaseForRequest: () => client as never };
  await handleRequest(post({ url: PAGE }), deps);
  const second = await (await handleRequest(post({ url: `${PAGE}/?utm_campaign=x#top` }), deps)).json();
  assertEquals(second.duplicate, true);
  assertEquals(rows.length, 1);
});
