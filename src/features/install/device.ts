import { Platform } from 'react-native';

import { detectPlatform, INSTALL_DISMISSED_KEY, shouldShowInstall, type DevicePlatform } from './logic';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// Chrome su Android può proporre "Installa" con un tocco: teniamo da parte l'invito appena arriva.
let deferredPrompt: InstallPromptEvent | null = null;
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as InstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    setInstallDismissed(true);
  });
}

/** Aperto dall'icona sulla schermata Home (quindi già "app"). */
export function isStandalone(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || !!window.matchMedia?.('(display-mode: standalone)').matches;
}

export function currentPlatform(): DevicePlatform {
  if (typeof navigator === 'undefined') return 'other';
  return detectPlatform(navigator.userAgent ?? '', navigator.maxTouchPoints ?? 0);
}

export function isInstallDismissed(): boolean {
  try {
    return globalThis.localStorage?.getItem(INSTALL_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setInstallDismissed(value: boolean) {
  try {
    if (value) globalThis.localStorage?.setItem(INSTALL_DISMISSED_KEY, '1');
    else globalThis.localStorage?.removeItem(INSTALL_DISMISSED_KEY);
  } catch {
    // memoria del browser non disponibile: la pagina si rivedrà alla prossima visita
  }
}

export function needsInstallHint(): boolean {
  return shouldShowInstall({ isWeb: Platform.OS === 'web', standalone: isStandalone(), dismissed: isInstallDismissed() });
}

export const canPromptInstall = () => deferredPrompt !== null;

/** Apre la finestra "Installa app" di Chrome. true se l'utente ha accettato. */
export async function promptInstall(): Promise<boolean> {
  const e = deferredPrompt;
  if (!e) return false;
  deferredPrompt = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === 'accepted';
}
