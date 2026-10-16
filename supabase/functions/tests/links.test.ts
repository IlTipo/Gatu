import { assertEquals } from 'jsr:@std/assert@1';

import { detectPlatform, extractUrl, isSafePublicUrl, isShortLink, normalizeUrl } from '../_shared/links.ts';

Deno.test('extractUrl: trova il link nel testo condiviso', () => {
  assertEquals(
    extractUrl('Guarda questa ricetta! https://vm.tiktok.com/ZMabc123/ 😋'),
    'https://vm.tiktok.com/ZMabc123/',
  );
  assertEquals(
    extractUrl('(https://www.giallozafferano.it/ricetta/x.html).'),
    'https://www.giallozafferano.it/ricetta/x.html',
  );
  assertEquals(extractUrl('nessun link qui'), null);
  assertEquals(extractUrl(''), null);
  assertEquals(extractUrl(null), null);
});

Deno.test('detectPlatform', () => {
  assertEquals(detectPlatform('https://www.tiktok.com/@chef/video/123'), 'tiktok');
  assertEquals(detectPlatform('https://vm.tiktok.com/abc/'), 'tiktok');
  assertEquals(detectPlatform('https://www.instagram.com/reel/Cxyz/'), 'instagram');
  assertEquals(detectPlatform('https://youtu.be/dQw4w9WgXcQ'), 'youtube');
  assertEquals(detectPlatform('https://m.youtube.com/shorts/abc'), 'youtube');
  assertEquals(detectPlatform('https://it.pinterest.com/pin/123/'), 'pinterest');
  assertEquals(detectPlatform('https://www.pinterest.co.uk/pin/123/'), 'pinterest');
  assertEquals(detectPlatform('https://pin.it/abc'), 'pinterest');
  assertEquals(detectPlatform('https://www.giallozafferano.it/'), 'web');
  assertEquals(detectPlatform('https://nottiktok.com.example.org/'), 'web');
  assertEquals(detectPlatform('non un link'), 'web');
});

Deno.test('normalizeUrl: toglie tracciamento e frammenti', () => {
  assertEquals(
    normalizeUrl('http://WWW.Example.com/ricetta/?utm_source=ig&utm_medium=social&id=5#commenti'),
    'https://www.example.com/ricetta/?id=5',
  );
  assertEquals(normalizeUrl('https://example.com/ricetta/'), 'https://example.com/ricetta');
  assertEquals(normalizeUrl('https://example.com/'), 'https://example.com/');
});

Deno.test('normalizeUrl: stesso video, stesso indirizzo', () => {
  assertEquals(normalizeUrl('https://youtu.be/dQw4w9WgXcQ?si=abc'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assertEquals(normalizeUrl('https://youtu.be/dQw4w9WgXcQ?t=42'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42');
  assertEquals(
    normalizeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share&si=x'),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  );
  assertEquals(
    normalizeUrl('https://www.tiktok.com/@chef/video/7300000000000000000?is_from_webapp=1&sender_device=pc&lang=it'),
    'https://www.tiktok.com/@chef/video/7300000000000000000',
  );
  assertEquals(
    normalizeUrl('https://www.instagram.com/reel/Cxyz123/?igsh=abc&img_index=2'),
    'https://www.instagram.com/reel/Cxyz123',
  );
  assertEquals(normalizeUrl('https://m.tiktok.com/v/123.html'), 'https://www.tiktok.com/v/123.html');
});

Deno.test('normalizeUrl: rifiuta ciò che non è un link web', () => {
  assertEquals(normalizeUrl('ftp://example.com/file'), null);
  assertEquals(normalizeUrl('javascript:alert(1)'), null);
  assertEquals(normalizeUrl('ciao'), null);
});

Deno.test('isShortLink', () => {
  assertEquals(isShortLink('https://vm.tiktok.com/abc/'), true);
  assertEquals(isShortLink('https://pin.it/xyz'), true);
  assertEquals(isShortLink('https://www.tiktok.com/@x/video/1'), false);
});

Deno.test('isSafePublicUrl: blocca indirizzi interni', () => {
  for (
    const url of [
      'http://localhost/admin',
      'http://127.0.0.1:8080/',
      'http://10.0.0.5/',
      'http://192.168.1.1/',
      'http://172.20.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]/',
      'http://intranet/',
      'http://server.local/',
      'https://example.com:8443/',
      'file:///etc/passwd',
    ]
  ) {
    assertEquals(isSafePublicUrl(url), false, url);
  }
  for (const url of ['https://www.tiktok.com/@x/video/1', 'http://example.com/', 'https://172.15.0.1/']) {
    assertEquals(isSafePublicUrl(url), true, url);
  }
});
