import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from './Button';

/** "‹ Indietro": torna alla pagina precedente, o a `fallback` se si è arrivati da un link diretto. */
export function BackButton({ fallback = '/library' }: { fallback?: Href }) {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <Button
        label={`‹ ${t('common.back')}`}
        variant="ghost"
        onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
      />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { alignSelf: 'flex-start', marginLeft: -16 } });
