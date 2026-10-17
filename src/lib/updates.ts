// Aggiornamenti del sito (anche per chi l'ha aggiunto alla schermata Home):
// ogni pubblicazione scrive /version.json; se è diverso da questa versione, si ricarica la pagina.

import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
export const CURRENT_BUILD = process.env.EXPO_PUBLIC_BUILD_ID ?? '';
// se l'app è rimasta in secondo piano più di così, alla riapertura si aggiorna da sola
const AUTO_RELOAD_AFTER_MS = 10 * 60_000;
const CHECK_EVERY_MS = 5 * 60_000;

const basePath = () => String(Constants.expoConfig?.experiments?.baseUrl ?? '').replace(/\/+$/, '');

export function isNewBuild(remote: unknown, current = CURRENT_BUILD): boolean {
  const build = (remote as { build?: unknown } | null)?.build;
  return !!current && typeof build === 'string' && build.length > 0 && build !== current;
}

/** C'è una versione nuova pubblicata? (non lancia mai errori: senza rete risponde false) */
export async function checkForUpdate(): Promise<boolean> {
  if (!isWeb || !CURRENT_BUILD) return false;
  try {
    navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
    const res = await fetch(`${basePath()}/version.json?t=${Date.now()}`, { cache: 'no-store' });
    return res.ok && isNewBuild(await res.json());
  } catch {
    return false;
  }
}

export function reloadApp() {
  if (isWeb) window.location.reload();
}

/**
 * Controlla gli aggiornamenti all'avvio, quando torni nell'app e ogni 5 minuti.
 * Se l'app era chiusa da un po' si aggiorna da sola; altrimenti restituisce true (per mostrare "Aggiorna").
 */
export function useAppUpdates(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!isWeb || !CURRENT_BUILD) return;
    let hiddenAt: number | null = null;
    let alive = true;
    const check = async (autoReload: boolean) => {
      if (await checkForUpdate()) {
        if (autoReload) reloadApp();
        else if (alive) setAvailable(true);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else {
        const away = hiddenAt ? Date.now() - hiddenAt : 0;
        hiddenAt = null;
        check(away >= AUTO_RELOAD_AFTER_MS);
      }
    };
    check(false);
    const timer = setInterval(() => check(false), CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return available;
}
