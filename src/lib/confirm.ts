import { Alert, Platform } from 'react-native';

/** Chiede conferma all'utente (finestra del browser sul sito, avviso nativo sul telefono). */
export function confirm(message: string, labels: { ok: string; cancel: string }): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => {
    Alert.alert(message, undefined, [
      { text: labels.cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: labels.ok, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
