// Prova a mano con l'AI vera: quanto ci mette a inventare una ricetta con impostazioni diverse.
import { buildFridgeMessage, FRIDGE_RECIPE_PROMPT, GEMINI_FRIDGE_RECIPE_SCHEMA } from '../_shared/fridge.ts';

const key = Deno.env.get('GEMINI_API_KEY')!;
const user = buildFridgeMessage({
  ingredients: ['petto di pollo', 'zucchine', 'patate', 'yogurt greco', 'limone', 'pane'],
  servings: 2,
  maxMinutes: null,
  avoid: [],
  tools: ['friggitrice ad aria'],
  prefs: ['leggera'],
});
const configs: [string, string, Record<string, unknown>][] = [
  ['ora: flash + ragionamento basso', 'gemini-flash-latest', { temperature: 0.2, thinkingConfig: { thinkingLevel: 'low' } }],
  ['flash + ragionamento minimo, temp 0.9', 'gemini-flash-latest', { temperature: 0.9, thinkingConfig: { thinkingLevel: 'minimal' } }],
  ['flash-lite, temp 0.9', 'gemini-flash-lite-latest', { temperature: 0.9 }],
  ['flash-lite + minimo, temp 0.9', 'gemini-flash-lite-latest', { temperature: 0.9, thinkingConfig: { thinkingLevel: 'minimal' } }],
];
for (const [label, model, extra] of configs) {
  for (let i = 0; i < 2; i++) {
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: FRIDGE_RECIPE_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_FRIDGE_RECIPE_SCHEMA, maxOutputTokens: 8192, ...extra },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    } catch (e) {
      console.log(`${label} #${i + 1}: nessuna risposta (${(e as Error).name}) dopo ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      continue;
    }
    const s = ((Date.now() - t0) / 1000).toFixed(1);
    const data = await res.json();
    if (!res.ok) {
      console.log(`${label} #${i + 1}: ${res.status} ${data.error?.status} ${String(data.error?.message).slice(0, 120)} (${s}s)`);
      continue;
    }
    const text = (data.candidates?.[0]?.content?.parts ?? []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text).join('');
    let title = '?', steps = 0;
    try {
      const j = JSON.parse(text);
      title = j.title;
      steps = j.steps?.length ?? 0;
    } catch { /* */ }
    const u = data.usageMetadata ?? {};
    console.log(`${label} #${i + 1}: ${s}s · ${data.modelVersion} · uscita ${u.candidatesTokenCount} tok, ragionamento ${u.thoughtsTokenCount ?? 0} tok · "${title}" (${steps} passaggi)`);
  }
}
