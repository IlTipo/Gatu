import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Indirizzo del sito (es. https://morsoapp.pages.dev). */
export function siteUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const base = String(Constants.expoConfig?.experiments?.baseUrl ?? '').replace(/\/+$/, '');
    return `${window.location.origin}${base}`;
  }
  return 'https://morsoapp.pages.dev';
}

/**
 * Condivide un link con il menu "Condividi" del telefono (WhatsApp, Messaggi…).
 * Se non c'è, copia il link. Risultato: shared, copied, cancelled o failed.
 */
export async function shareLink(data: { title: string; text: string; url: string }): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  // messaggio e link in un unico testo ("Entra e scopri Morso! https://…"): così ogni app
  // (WhatsApp, Messaggi, Instagram…) mostra entrambi, una volta sola
  const message = `${data.text} ${data.url}`;
  if (nav?.share) {
    try {
      await nav.share({ title: data.title, text: message });
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await nav?.clipboard?.writeText(message);
    return nav?.clipboard ? 'copied' : 'failed';
  } catch {
    return 'failed';
  }
}
