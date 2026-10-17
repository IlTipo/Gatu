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
  if (nav?.share) {
    try {
      await nav.share(data);
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await nav?.clipboard?.writeText(`${data.text} ${data.url}`);
    return nav?.clipboard ? 'copied' : 'failed';
  } catch {
    return 'failed';
  }
}
