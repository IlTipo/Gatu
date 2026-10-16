import { assertEquals } from 'jsr:@std/assert@1';

import { decodeEntities, findRecipeJsonLd, parseHtmlMetadata } from '../_shared/html.ts';

const recipePage = `<!doctype html><html><head>
<title>Pasta e patate - Ricetta | Il Blog</title>
<meta property="og:title" content="Pasta e patate cremosa &amp; veloce">
<meta property='og:description' content='La ricetta napoletana: pasta mista, patate e provola. Pronta in 30 minuti.'>
<meta property="og:image" content="/img/pasta-patate.jpg">
<meta property="og:site_name" content="Il Blog di Cucina">
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[{"@type":"WebPage","name":"x"},
 {"@type":["Recipe"],"name":"Pasta e patate","recipeYield":"4","recipeIngredient":["320 g di pasta mista","500 g di patate"],
  "author":{"@type":"Person","name":"Maria"},"image":["https://cdn.example.com/a.jpg"]}]}
</script>
</head><body>…</body></html>`;

Deno.test('legge Open Graph, risolve immagini relative e decodifica le entità', () => {
  const meta = parseHtmlMetadata(recipePage, 'https://blog.example.com/ricette/pasta-patate/');
  assertEquals(meta.title, 'Pasta e patate cremosa & veloce');
  assertEquals(meta.description, 'La ricetta napoletana: pasta mista, patate e provola. Pronta in 30 minuti.');
  assertEquals(meta.imageUrl, 'https://blog.example.com/img/pasta-patate.jpg');
  assertEquals(meta.siteName, 'Il Blog di Cucina');
  assertEquals(meta.author, 'Maria');
  assertEquals((meta.recipeJsonLd?.recipeIngredient as string[]).length, 2);
});

Deno.test('senza Open Graph usa <title> e meta description', () => {
  const meta = parseHtmlMetadata(
    '<html><head><TITLE>Trattoria da Gino</TITLE><meta name="description" content="Cucina ligure a Genova"></head></html>',
    'https://gino.example.it/',
  );
  assertEquals(meta.title, 'Trattoria da Gino');
  assertEquals(meta.description, 'Cucina ligure a Genova');
  assertEquals(meta.imageUrl, null);
  assertEquals(meta.recipeJsonLd, null);
});

Deno.test('JSON-LD rotto o senza ricetta non fa danni', () => {
  assertEquals(findRecipeJsonLd('<script type="application/ld+json">{ rotto </script>'), null);
  assertEquals(findRecipeJsonLd('<script type="application/ld+json">{"@type":"Article"}</script>'), null);
  assertEquals(
    (findRecipeJsonLd('<script type="application/ld+json">[{"@type":"Recipe","name":"Tiramisù"}]</script>') as {
      name: string;
    }).name,
    'Tiramisù',
  );
});

Deno.test('rifiuta immagini con protocolli strani', () => {
  const meta = parseHtmlMetadata('<meta property="og:image" content="javascript:alert(1)">', 'https://x.example.com/');
  assertEquals(meta.imageUrl, null);
});

Deno.test('decodeEntities', () => {
  assertEquals(decodeEntities('Caff&egrave; &amp; biscotti &#8211; 5&#x20AC;'), 'Caffè & biscotti – 5€');
  assertEquals(decodeEntities('&sconosciuta;'), '&sconosciuta;');
});
