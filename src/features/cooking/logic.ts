// Logica della modalità cucina, senza schermate: testabile.

import { normalize } from '@/features/library/filter';
import { FAMILIES, stem } from '@/features/library/pantry';

// parole che non identificano un ingrediente
const STOPWORDS = new Set(['di', 'del', 'della', 'dello', 'dei', 'degli', 'delle', 'al', 'alla', 'con', 'per', 'in', 'da', 'e', 'o', 'a', 'il', 'la', 'lo', 'le', 'gli', 'un', 'una', 'q.b.', 'fresco', 'fresca', 'freschi', 'fresche', 'grande', 'piccolo', 'tritato', 'tritata']);

function stems(text: string): string[] {
  return normalize(text)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map(stem);
}

/** La parola principale di un ingrediente: "olio extravergine di oliva" → "oli". */
function headStem(name: string): string | null {
  return stems(name)[0] ?? null;
}

/**
 * Gli ingredienti nominati in un passaggio ("Sbatti le uova con il parmigiano" → uova, parmigiano).
 * Vale anche il nome generico: "Cuoci la pasta" trova gli spaghetti.
 */
export function ingredientsForStep<T extends { name: string }>(stepText: string, ingredients: T[]): T[] {
  const inStep = new Set(stems(stepText));
  const generic = Object.entries(FAMILIES).filter(([family]) => inStep.has(stem(family)));
  return ingredients.filter((i) => {
    const head = headStem(i.name);
    if (!head) return false;
    if (inStep.has(head)) return true;
    const name = normalize(i.name);
    return generic.some(([, specific]) => specific.some((s) => name.startsWith(s)));
  });
}

/** 605 s → "10:05"; 3725 s → "1:02:05"; mai negativo. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export type VoiceCommand = 'next' | 'prev' | 'timer' | 'stop';

const COMMANDS: [VoiceCommand, RegExp][] = [
  ['stop', /\b(stop|ferma|fermati|basta|spegni|silenzio)\b/],
  ['timer', /\b(timer|avvia|fai partire|cronometro)\b/],
  ['prev', /\b(indietro|precedente|torna)\b/],
  ['next', /\b(avanti|successivo|prossimo|continua|vai|fatto)\b/],
];

/** Riconosce un comando nella frase detta (l'ultima parola che conta vince: "no aspetta indietro"). */
export function parseVoiceCommand(transcript: string): VoiceCommand | null {
  const text = normalize(transcript);
  let best: { cmd: VoiceCommand; at: number } | null = null;
  for (const [cmd, re] of COMMANDS) {
    const global = new RegExp(re.source, 'g');
    for (const m of text.matchAll(global)) {
      if (!best || m.index! > best.at) best = { cmd, at: m.index! };
    }
  }
  return best?.cmd ?? null;
}

/** Etichetta corta per un timer: "Passo 3 · Cuoci la pasta…" */
export function timerLabel(stepNumber: number, stepText: string): string {
  const text = stepText.replace(/\s+/g, ' ').trim();
  const short = text.length > 24 ? `${text.slice(0, 23).trimEnd()}…` : text;
  return `${stepNumber} · ${short}`;
}
