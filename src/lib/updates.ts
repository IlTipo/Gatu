// Aggiornamenti del sito (anche per chi l'ha aggiunto alla schermata Home).
// Ogni pubblicazione scrive /version.json con { build, version, notes }:
// - stessa versione, build diversa → aggiornamento "semplice": si applica da solo alla riapertura;
// - versione diversa (es. 1.0.1) → "È disponibile Morso 1.0.1" nel Profilo, col pallino sulla scheda.

import Constants from 'expo-constants';
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import changelog from '@/changelog.json';

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
export const CURRENT_BUILD = process.env.EXPO_PUBLIC_BUILD_ID ?? '';
export const CURRENT_VERSION = Constants.expoConfig?.version ?? '0.0.0';
const SILENT_RELOAD_AFTER_MS = 2 * 60_000; // aggiornamento semplice: dopo 2 minuti fuori dall'app
const VERSION_RELOAD_AFTER_MS = 10 * 60_000; // versione nuova: dopo 10 minuti (prima resta l'avviso)
const CHECK_EVERY_MS = 5 * 60_000;
const SEEN_KEY = 'morso.seenVersion';

export type ChangelogEntry = { version: string; date: string; notes: string[] };
export type UpdateState =
  | { kind: 'none' }
  | { kind: 'silent' }
  | { kind: 'version'; version: string; notes: string[] };

const basePath = () => String(Constants.expoConfig?.experiments?.baseUrl ?? '').replace(/\/+$/, '');

/** "1.0.10" > "1.0.9": confronto numero per numero. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** Cosa dice /version.json rispetto a questa app. */
export function classifyRemote(remote: unknown, current = { build: CURRENT_BUILD, version: CURRENT_VERSION }): UpdateState {
  const r = (remote ?? {}) as { build?: unknown; version?: unknown; notes?: unknown };
  if (!current.build || typeof r.build !== 'string' || !r.build || r.build === current.build) return { kind: 'none' };
  if (typeof r.version === 'string' && compareVersions(r.version, current.version) > 0) {
    const notes = Array.isArray(r.notes) ? r.notes.filter((n): n is string => typeof n === 'string').slice(0, 10) : [];
    return { kind: 'version', version: r.version.slice(0, 20), notes };
  }
  return { kind: 'silent' };
}

// ---- stato condiviso (un solo controllo per tutta l'app)
let state: UpdateState = { kind: 'none' };
const listeners = new Set<() => void>();
const setState = (next: UpdateState) => {
  state = next;
  listeners.forEach((l) => l());
};

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

/** Controlla /version.json (senza rete risponde "nessun aggiornamento"). */
export async function checkForUpdate(): Promise<UpdateState> {
  if (!isWeb || !CURRENT_BUILD) return state;
  try {
    navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
    const res = await fetch(`${basePath()}/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) setState(classifyRemote(await res.json()));
  } catch {
    // offline: si riprova più tardi
  }
  return state;
}

export function reloadApp() {
  if (isWeb) window.location.reload();
}

/** Da montare una volta (layout principale): controlla all'avvio, al ritorno nell'app e ogni 5 minuti. */
export function useUpdateChecker() {
  useEffect(() => {
    if (!isWeb || !CURRENT_BUILD) return;
    let hiddenAt: number | null = null;
    const onVisibility = async () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = null;
      const s = await checkForUpdate();
      if (s.kind === 'silent' && away >= SILENT_RELOAD_AFTER_MS) reloadApp();
      if (s.kind === 'version' && away >= VERSION_RELOAD_AFTER_MS) reloadApp();
    };
    checkForUpdate();
    const timer = setInterval(checkForUpdate, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}

// ---- "Novità" dopo l'aggiornamento

export const CHANGELOG = changelog as ChangelogEntry[];

function readSeen(): string | null {
  try {
    return globalThis.localStorage?.getItem(SEEN_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Le novità da mostrare una volta dopo un aggiornamento (null al primo avvio o se già viste). */
export function unseenNews(seen: string | null, current = CURRENT_VERSION, log = CHANGELOG): ChangelogEntry[] | null {
  if (!seen || compareVersions(current, seen) <= 0) return null;
  const entries = log.filter((e) => compareVersions(e.version, seen) > 0 && compareVersions(e.version, current) <= 0);
  return entries.length ? entries : null;
}

let seenVersion = readSeen();
if (isWeb && !seenVersion) {
  // primo avvio: niente "novità", si parte da questa versione
  seenVersion = CURRENT_VERSION;
  try {
    globalThis.localStorage?.setItem(SEEN_KEY, CURRENT_VERSION);
  } catch {
    // niente
  }
}
const newsListeners = new Set<() => void>();

export function useNews(): ChangelogEntry[] | null {
  const seen = useSyncExternalStore(
    (l) => {
      newsListeners.add(l);
      return () => newsListeners.delete(l);
    },
    () => seenVersion,
    () => seenVersion,
  );
  return unseenNews(seen);
}

export function markNewsSeen() {
  seenVersion = CURRENT_VERSION;
  try {
    globalThis.localStorage?.setItem(SEEN_KEY, CURRENT_VERSION);
  } catch {
    // niente
  }
  newsListeners.forEach((l) => l());
}
