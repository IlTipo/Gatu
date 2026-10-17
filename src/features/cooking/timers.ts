// Timer della modalità cucina: più timer insieme, ognuno col suo nome.
// Contano dall'ora di fine (non "secondi che passano"), così restano giusti anche se il
// browser rallenta la pagina in background, e sopravvivono a un ricaricamento della pagina.

import { useEffect, useState, useSyncExternalStore } from 'react';

import { beep, notify, prepareAlerts } from './alerts';

export type CookingTimer = {
  id: string;
  label: string;
  recipeId: string;
  endAt: number;
  durationMs: number;
  ringing: boolean;
};

const STORAGE_KEY = 'morso-cooking-timers';
let timers: CookingTimer[] = load();
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;
let ringTicker: ReturnType<typeof setInterval> | null = null;

function load(): CookingTimer[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as CookingTimer[]) : [];
    return Array.isArray(list) ? list.filter((t) => typeof t.endAt === 'number') : [];
  } catch {
    return [];
  }
}

function save() {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(timers));
  } catch {
    // memoria del browser non disponibile: i timer valgono finché la pagina resta aperta
  }
}

function emit(next: CookingTimer[]) {
  timers = next;
  save();
  listeners.forEach((l) => l());
  schedule();
}

/** Controlla i timer scaduti; parte da solo quando c'è almeno un timer. */
export function checkTimers(now = Date.now()) {
  const expired = timers.filter((t) => !t.ringing && t.endAt <= now);
  if (expired.length) {
    emit(timers.map((t) => (expired.includes(t) ? { ...t, ringing: true } : t)));
    for (const t of expired) notify('⏱ Timer finito', t.label, t.id);
    beep();
  }
}

function schedule() {
  const running = timers.some((t) => !t.ringing);
  const ringing = timers.some((t) => t.ringing);
  if (running && !ticker) ticker = setInterval(() => checkTimers(), 500);
  if (!running && ticker) {
    clearInterval(ticker);
    ticker = null;
  }
  if (ringing && !ringTicker) ringTicker = setInterval(beep, 1500);
  if (!ringing && ringTicker) {
    clearInterval(ringTicker);
    ringTicker = null;
  }
}

export function startTimer(label: string, seconds: number, recipeId: string, now = Date.now()): CookingTimer {
  prepareAlerts();
  const timer: CookingTimer = {
    id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
    label,
    recipeId,
    endAt: now + seconds * 1000,
    durationMs: seconds * 1000,
    ringing: false,
  };
  emit([...timers, timer].slice(-10));
  return timer;
}

export function cancelTimer(id: string) {
  emit(timers.filter((t) => t.id !== id));
}

/** "Stop": spegne i timer che suonano (e li toglie). */
export function stopRinging() {
  emit(timers.filter((t) => !t.ringing));
}

export function addMinute(id: string) {
  emit(timers.map((t) => (t.id === id ? { ...t, endAt: Math.max(t.endAt, Date.now()) + 60_000, ringing: false } : t)));
}

export function getTimers() {
  return timers;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  schedule();
  return () => listeners.delete(listener);
}

/** I timer attivi, aggiornati ogni mezzo secondo. */
export function useTimers(): CookingTimer[] {
  return useSyncExternalStore(subscribe, getTimers, getTimers);
}

/** L'ora attuale, aggiornata ogni mezzo secondo finché "active" è vero (per i conti alla rovescia). */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** Solo per i test. */
export function resetTimersForTests() {
  if (ticker) clearInterval(ticker);
  if (ringTicker) clearInterval(ringTicker);
  ticker = ringTicker = null;
  timers = [];
}
