// Notifiche push del browser (Web Push) senza librerie esterne, solo con WebCrypto:
// - firma VAPID (RFC 8292): dice al servizio push del browser che il messaggio arriva da Morso;
// - cifratura aes128gcm (RFC 8291): solo il telefono dell'utente può leggere il contenuto.

export type PushSubscription = { endpoint: string; p256dh: string; auth: string };
export type VapidKeys = { publicKey: string; privateJwk: JsonWebKey; subject: string };
export type PushMessage = { title: string; body: string; url: string; tag: string };
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const enc = new TextEncoder();
export type Bytes = Uint8Array<ArrayBuffer>;

export function b64url(bytes: Bytes): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(text: string): Bytes {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

async function hmac(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** Intestazione "Authorization: vapid t=…, k=…" per l'indirizzo del servizio push. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, now = Date.now()): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(
    enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject })),
  );
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)),
  );
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${keys.publicKey}`;
}

/** Cifra il messaggio per un dispositivo (aes128gcm, un solo blocco). */
export async function encryptPayload(sub: PushSubscription, payload: Bytes): Promise<Bytes> {
  const uaPublic = fromB64url(sub.p256dh);
  const authSecret = fromB64url(sub.auth);
  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const prkKey = await hmac(authSecret, shared);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(payload, new Uint8Array([2]))),
  );
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/** Manda una notifica. "gone": il dispositivo non c'è più (va cancellato). */
export async function sendPush(
  sub: PushSubscription,
  message: PushMessage,
  keys: VapidKeys,
  fetchImpl: FetchLike,
): Promise<'sent' | 'gone' | 'failed'> {
  if (!/^https:\/\//.test(sub.endpoint)) return 'gone';
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(message)));
  try {
    const res = await fetchImpl(sub.endpoint, {
      method: 'POST',
      headers: {
        authorization: await vapidAuthorization(sub.endpoint, keys),
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        ttl: '43200',
        urgency: 'normal',
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    await res.body?.cancel();
    if (res.status === 404 || res.status === 410) return 'gone';
    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}
