import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

/**
 * Solo link "sicuri": pagine web, telefono, email. Un link "javascript:" o "data:" (che potrebbe
 * arrivare da un dato salvato) non viene mai aperto.
 */
export function isSafeExternalUrl(url: string): boolean {
  return /^(https?:\/\/|tel:|mailto:)/i.test(url.trim());
}

/** Apre un link esterno (sul sito in una nuova scheda, così Morso resta aperto). */
export async function openExternalUrl(url: string) {
  if (!isSafeExternalUrl(url)) return;
  if (Platform.OS === 'web') {
    // "tel:" e "mailto:" aprono l'app del telefono: niente scheda nuova vuota
    if (/^(tel|mailto):/i.test(url)) {
      window.location.href = url;
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await Linking.openURL(url);
}
