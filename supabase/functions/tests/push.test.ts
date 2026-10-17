import { assertEquals } from 'jsr:@std/assert@1';

import { b64url, type Bytes, encryptPayload, fromB64url, vapidAuthorization, type VapidKeys } from '../_shared/webpush.ts';
import { handlePush, type PushDeps } from '../push/handler.ts';

const enc = new TextEncoder();
const hmac = async (key: Bytes, data: Bytes) =>
  new Uint8Array(
    await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), data),
  );
const concat = (...p: Bytes[]) => {
  const out = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of p) (out.set(x, i), (i += x.length));
  return out;
};

async function browser() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { pair, pub, auth, sub: { endpoint: 'https://push.example.com/abc', p256dh: b64url(pub), auth: b64url(auth) } };
}

async function vapidKeys(): Promise<VapidKeys & { verify: CryptoKey }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { publicKey: b64url(raw), privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey), subject: 'https://morso.test', verify: pair.publicKey };
}

Deno.test('web push: il telefono riesce a decifrare il messaggio (RFC 8291)', async () => {
  const b = await browser();
  const body = await encryptPayload(b.sub, enc.encode('{"title":"Ciao"}'));
  // lato telefono
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, b.pair.privateKey, 256));
  const ikm = await hmac(await hmac(b.auth, shared), concat(enc.encode('WebPush: info\0'), b.pub, asPublic, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), cipher),
  );
  assertEquals(new TextDecoder().decode(plain.slice(0, -1)), '{"title":"Ciao"}');
  assertEquals(plain[plain.length - 1], 2);
});

Deno.test('web push: firma VAPID valida, per il servizio giusto', async () => {
  const keys = await vapidKeys();
  const auth = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/xyz', keys, Date.UTC(2026, 9, 18));
  const [, token, k] = auth.match(/^vapid t=([^,]+), k=(.+)$/)!;
  assertEquals(k, keys.publicKey);
  const [h, c, s] = token.split('.');
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(c)));
  assertEquals(claims.aud, 'https://fcm.googleapis.com');
  assertEquals(claims.sub, 'https://morso.test');
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.verify, fromB64url(s), enc.encode(`${h}.${c}`));
  assertEquals(ok, true);
});

function deps(over: Partial<PushDeps> = {}): PushDeps & { removed: string[]; sentTo: string[] } {
  const removed: string[] = [];
  const sentTo: string[] = [];
  return {
    removed,
    sentTo,
    fetch: () => Promise.resolve(new Response(null, { status: 201 })),
    cronSecret: () => Promise.resolve('s'.repeat(40)),
    vapid: () => Promise.resolve({ publicKey: 'k', privateJwk: {}, subject: 'https://x' }),
    due: () => Promise.resolve([{ user_id: 'u1', title: '❤️ Mi piace', body: 'b', url: '/recipe/1', tag: 'like-1' }]),
    devices: () =>
      Promise.resolve([
        { id: 'd1', user_id: 'u1', endpoint: 'https://push.example.com/1', p256dh: 'p', auth: 'a' },
        { id: 'd2', user_id: 'u1', endpoint: 'https://push.example.com/2', p256dh: 'p', auth: 'a' },
        { id: 'd3', user_id: 'u2', endpoint: 'https://push.example.com/3', p256dh: 'p', auth: 'a' },
      ]),
    removeDevices: (ids) => (removed.push(...ids), Promise.resolve()),
    send: (d) => (sentTo.push(d.endpoint), Promise.resolve(d.endpoint.endsWith('/2') ? 'gone' : 'sent')),
    ...over,
  };
}
const call = (secret: string) => new Request('https://x/push', { method: 'POST', headers: { 'x-cron-secret': secret } });

Deno.test('funzione push: solo il database (con il segreto) può farla partire', async () => {
  const d = deps();
  assertEquals((await handlePush(call('sbagliato'), d)).status, 401);
  assertEquals((await handlePush(new Request('https://x/push', { method: 'POST' }), d)).status, 401);
  assertEquals(d.sentTo, []);
  const weak = deps({ cronSecret: () => Promise.resolve('corto') });
  assertEquals((await handlePush(call('corto'), weak)).status, 401);
});

Deno.test('funzione push: manda a tutti i dispositivi della persona e toglie quelli spariti', async () => {
  const d = deps();
  const res = await (await handlePush(call('s'.repeat(40)), d)).json();
  assertEquals(res, { sent: 1, removed: 1 });
  assertEquals(d.sentTo, ['https://push.example.com/1', 'https://push.example.com/2']);
  assertEquals(d.removed, ['d2']);
});
