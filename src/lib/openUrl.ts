import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

/** Apre un link esterno (sul sito in una nuova scheda, così Morso resta aperto). */
export async function openExternalUrl(url: string) {
  if (Platform.OS === 'web') {
    // "tel:" e "mailto:" aprono l'app del telefono: niente scheda nuova vuota
    if (/^(tel|mailto):/.test(url)) {
      window.location.href = url;
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await Linking.openURL(url);
}
