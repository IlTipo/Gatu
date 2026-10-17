import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Tiene lo schermo acceso finché la schermata è aperta.
 * Sul sito il browser lo "rilascia" quando cambi app o scheda: al ritorno lo richiediamo.
 * Se il browser non lo supporta, semplicemente non succede nulla.
 */
export function useScreenAwake(tag: string) {
  useEffect(() => {
    const activate = () => activateKeepAwakeAsync(tag).catch(() => {});
    activate();
    const onVisible = () => {
      if (document.visibilityState === 'visible') activate();
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      deactivateKeepAwake(tag).catch(() => {});
    };
  }, [tag]);
}
