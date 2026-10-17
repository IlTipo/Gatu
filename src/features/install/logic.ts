// Pagina "Aggiungimi alla schermata Home": quando mostrarla e quale telefono evidenziare.

export type DevicePlatform = 'ios' | 'android' | 'other';

export const INSTALL_DISMISSED_KEY = 'morso.installHint.dismissed';

/** iPhone/iPad (anche iPad che si presenta come Mac), Android o altro. */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): DevicePlatform {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (ua.includes('macintosh') && maxTouchPoints > 1) return 'ios';
  if (ua.includes('android')) return 'android';
  return 'other';
}

/** Va mostrata se il sito non è già aperto come app e l'utente non ha scelto "non mostrare più". */
export function shouldShowInstall({ isWeb, standalone, dismissed }: { isWeb: boolean; standalone: boolean; dismissed: boolean }) {
  return isWeb && !standalone && !dismissed;
}
