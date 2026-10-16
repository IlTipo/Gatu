// Il piano gratuito di Gemini accetta poche richieste al minuto:
// i test dal vivo aspettano tra una chiamata e l'altra e riprovano se vengono frenati.
const GAP_MS = 13_000;
let last = 0;

export async function throttled<T extends { ok: boolean; reason?: string }>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0;; attempt++) {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const result = await call();
    if (result.ok || result.reason !== 'rate_limited' || attempt >= 2) return result;
    await new Promise((r) => setTimeout(r, 30_000));
  }
}
