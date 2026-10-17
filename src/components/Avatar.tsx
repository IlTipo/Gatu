import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';

/** Foto profilo rotonda; senza foto mostra l'iniziale del nome. */
export function Avatar({ url, name, size = 48 }: { url: string | null | undefined; name: string | null | undefined; size?: number }) {
  const { colors } = useTheme();
  const initial = (name?.trim()[0] ?? '?').toUpperCase();
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: url ? colors.surfaceMuted : colors.primary },
      ]}>
      {url ? (
        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <AppText tone="onPrimary" style={{ fontSize: size * 0.42, lineHeight: size * 0.5, fontWeight: '700' }}>
          {initial}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
