import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { fetchLinkMetadata, UnsafeUrlError } from '../_shared/metadata.ts';
import { fakeFetch, html, jsonRoute, redirect } from './fakes.ts';

const TIKTOK = 'https://www.tiktok.com/@chefmario/video/7300000000000000001';

Deno.test('TikTok: segue il link corto e usa oEmbed (la caption è il titolo)', async () => {
  const { fetch, calls } = fakeFetch({
    'https://vm.tiktok.com/ZMabc': redirect(`${TIKTOK}?is_from_webapp=1&sender_device=pc`),
    [`${TIKTOK}?is_from_webapp=1&sender_device=pc`]: html('<html></html>'),
    [`https://www.tiktok.com/oembed?url=${encodeURIComponent(TIKTOK)}`]: jsonRoute({
      title: 'Carbonara in 10 minuti 🍝 #ricetta #pasta guanciale, uova, pecorino',
      author_name: 'Chef Mario',
      thumbnail_url: 'https://p16.tiktokcdn.com/thumb.jpeg',
    }),
  });
  const meta = await fetchLinkMetadata('https://vm.tiktok.com/ZMabc', fetch);
  assertEquals(meta.url, TIKTOK);
  assertEquals(meta.platform, 'tiktok');
  assertEquals(meta.author, 'Chef Mario');
  assertEquals(meta.description, 'Carbonara in 10 minuti 🍝 #ricetta #pasta guanciale, uova, pecorino');
  assertEquals(meta.thumbnailUrl, 'https://p16.tiktokcdn.com/thumb.jpeg');
  assertEquals(meta.needsText, false);
  // su TikTok non apriamo la pagina del video: bastano i dati ufficiali oEmbed
  assertEquals(calls.includes(TIKTOK), false);
});

Deno.test('YouTube: oEmbed + descrizione dalla pagina', async () => {
  const url = 'https://www.youtube.com/watch?v=abc123';
  const { fetch } = fakeFetch({
    [`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`]: jsonRoute({
      title: 'Focaccia genovese perfetta',
      author_name: 'Cucina con Anna',
      thumbnail_url: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
    }),
    [url]: html(
      '<meta property="og:description" content="Ingredienti: 500 g farina, 350 ml acqua, olio, sale grosso.">',
    ),
  });
  const meta = await fetchLinkMetadata('https://youtu.be/abc123?si=xyz', fetch);
  assertEquals(meta.platform, 'youtube');
  assertEquals(meta.title, 'Focaccia genovese perfetta');
  assertEquals(meta.description, 'Ingredienti: 500 g farina, 350 ml acqua, olio, sale grosso.');
});

Deno.test("Instagram: usa l'anteprima pubblica e pulisce la caption", async () => {
  const url = 'https://www.instagram.com/p/Cabc123';
  const { fetch } = fakeFetch({
    [url]: html(
      `<meta property="og:title" content="Giulia on Instagram">` +
        `<meta property="og:description" content="1,234 likes, 56 comments - giulia.mangia on May 2, 2026: &quot;I 5 posti dove mangiare a Bologna: Trattoria Anna Maria, Osteria dell&#39;Orsa…&quot;.">` +
        `<meta property="og:image" content="https://scontent.cdninstagram.com/x.jpg">`,
    ),
  });
  const meta = await fetchLinkMetadata(`${url}/?igsh=abc`, fetch);
  assertEquals(meta.platform, 'instagram');
  assertEquals(meta.description, "I 5 posti dove mangiare a Bologna: Trattoria Anna Maria, Osteria dell'Orsa…");
  assertEquals(meta.needsText, false);
});

Deno.test('Instagram senza anteprima: chiede di incollare la caption', async () => {
  const { fetch } = fakeFetch({}); // la pagina risponde 404
  const meta = await fetchLinkMetadata('https://www.instagram.com/reel/Cxyz', fetch);
  assertEquals(meta.title, null);
  assertEquals(meta.needsText, true);
});

Deno.test('Sito di ricette: trova la scheda ricetta JSON-LD', async () => {
  const url = 'https://www.ricette.example.it/tiramisu';
  const { fetch } = fakeFetch({
    [url]: html(
      '<title>Tiramisù</title><script type="application/ld+json">{"@type":"Recipe","name":"Tiramisù classico","recipeIngredient":["500 g mascarpone"]}</script>',
    ),
  });
  const meta = await fetchLinkMetadata(url, fetch);
  assertEquals(meta.platform, 'web');
  assertEquals(meta.title, 'Tiramisù classico'); // il nome della scheda ricetta vince sul <title>
  assertEquals(meta.recipeJsonLd?.name, 'Tiramisù classico');
  assertEquals(meta.needsText, false);
});

Deno.test('Blocca link interni e redirect verso indirizzi interni', async () => {
  const { fetch } = fakeFetch({ 'https://bit.ly/trappola': redirect('http://169.254.169.254/latest/meta-data/') });
  await assertRejects(() => fetchLinkMetadata('http://localhost:3000/', fetch), UnsafeUrlError);
  await assertRejects(() => fetchLinkMetadata('https://bit.ly/trappola', fetch), UnsafeUrlError);
});

Deno.test('Se la rete fallisce salva comunque il link (senza dati)', async () => {
  const failing = () => Promise.reject(new TypeError('network down'));
  const meta = await fetchLinkMetadata('https://www.example.com/ricetta', failing);
  assertEquals(meta.url, 'https://www.example.com/ricetta');
  assertEquals(meta.needsText, true);
});
