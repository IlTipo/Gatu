// Prova a mano: quali modelli gratuiti risponde la chiave e quali limiti (429) restituisce Google.
const key = Deno.env.get('GEMINI_API_KEY')!;
const base = 'https://generativelanguage.googleapis.com/v1beta';
const list = await (await fetch(`${base}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } })).json();
const names: string[] = (list.models ?? [])
  .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent'))
  .map((m: { name: string }) => m.name.replace('models/', ''));
console.log('modelli:', names.join(', '));
const wanted = names.filter((n) => /flash|gemma-3-27b|gemma-4/.test(n) && !/image|tts|audio|live|embedding/.test(n));
for (const model of ['gemini-flash-latest', 'gemini-flash-lite-latest', ...wanted]) {
  const t0 = Date.now();
  const res = await fetch(`${base}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Rispondi solo: ok' }] }] }),
    signal: AbortSignal.timeout(40_000),
  }).catch((e) => e as Error);
  const s = ((Date.now() - t0) / 1000).toFixed(1);
  if (res instanceof Error) { console.log(`${model}: ${s}s errore ${res.name}`); continue; }
  const body = await res.json().catch(() => ({}));
  if (res.ok) { console.log(`${model}: ${s}s OK ${body.modelVersion ?? ''}`); continue; }
  const details = (body.error?.details ?? [])
    .flatMap((d: { violations?: { quotaId?: string; quotaValue?: string }[]; retryDelay?: string }) =>
      d.violations?.map((v) => `${v.quotaId}=${v.quotaValue}`) ?? (d.retryDelay ? [`retry ${d.retryDelay}`] : []))
    .join(' ');
  console.log(`${model}: ${s}s HTTP ${res.status} ${body.error?.status ?? ''} ${details} ${String(body.error?.message ?? '').slice(0, 160)}`);
}
