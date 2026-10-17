// Morso senza internet (sito):
// 1. il service worker tiene in memoria i file del sito, così si apre anche offline;
// 2. le ricette, la spesa e il planner già aperti restano salvati sul dispositivo
//    (solo per l'utente collegato, cancellati quando esci) e si vedono anche offline.

import { dehydrate, type DehydratedState, hydrate, type QueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
const PREFIX = 'morso.cache.';
const MAX_AGE_MS = 7 * 86_400_000;
const MAX_BYTES = 3_000_000;
// cosa si porta offline: libreria e ricette, posti, planner, spesa, collezioni, porzioni e diario
const KEEP = new Set(['recipes', 'places', 'meal-plan', 'shopping', 'collections', 'profile-settings', 'food-log', 'my-profile']);

export function shouldPersist(queryKey: readonly unknown[], status: string): boolean {
  return status === 'success' && typeof queryKey[0] === 'string' && KEEP.has(queryKey[0]);
}

/** Rimette in memoria i dati salvati di questo utente (se non sono troppo vecchi). */
export function restoreCache(client: QueryClient, userId: string) {
  if (!isWeb) return;
  try {
    const raw = window.localStorage.getItem(PREFIX + userId);
    if (!raw) return;
    const saved = JSON.parse(raw) as { savedAt: number; state: DehydratedState };
    if (!saved?.savedAt || Date.now() - saved.savedAt > MAX_AGE_MS) return;
    hydrate(client, saved.state);
  } catch {
    // dati salvati rovinati: si riparte da zero
  }
}

/** Da qui in poi salva (con calma, ogni secondo al massimo) i dati utili offline. Restituisce lo "stop". */
export function startCachePersistence(client: QueryClient, userId: string): () => void {
  if (!isWeb) return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    timer = null;
    try {
      const state = dehydrate(client, { shouldDehydrateQuery: (q) => shouldPersist(q.queryKey, q.state.status) });
      const json = JSON.stringify({ savedAt: Date.now(), state });
      if (json.length <= MAX_BYTES) window.localStorage.setItem(PREFIX + userId, json);
    } catch {
      // memoria piena o non disponibile: offline si vedrà meno, ma l'app funziona lo stesso
    }
  };
  const unsubscribe = client.getQueryCache().subscribe(() => {
    if (!timer) timer = setTimeout(save, 1000);
  });
  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
  };
}

/** All'uscita: niente dati di questo utente restano sul dispositivo. */
export function clearPersistedCache() {
  if (!isWeb) return;
  try {
    for (const key of Object.keys(window.localStorage)) if (key.startsWith(PREFIX)) window.localStorage.removeItem(key);
  } catch {
    // niente da fare
  }
}

/** Registra il service worker (file del sito disponibili offline, notifiche dei timer). */
export function registerServiceWorker() {
  if (!isWeb || !('serviceWorker' in navigator)) return;
  const base = String(Constants.expoConfig?.experiments?.baseUrl ?? '').replace(/\/+$/, '');
  navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` }).catch(() => {});
}

/** true se c'è internet (sul sito segue gli eventi online/offline del browser). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => !isWeb || navigator.onLine !== false);
  useEffect(() => {
    if (!isWeb) return;
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
