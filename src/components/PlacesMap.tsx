// Sull'app nativa (non usata oggi: Morso è un sito) la mappa vera richiederebbe una build apposita:
// qui c'è un elenco con il pulsante per Google Maps. Il sito usa PlacesMap.web.tsx.
import { Pressable, StyleSheet, View } from 'react-native';

import { googleMapsUrl } from '@/features/places/format';
import { openExternalUrl } from '@/lib/openUrl';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import type { PlacesMapProps } from './PlacesMap.types';

export function PlacesMap({ places, onOpen }: PlacesMapProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.list}>
      {places.map((p) => (
        <View key={p.id} style={[styles.row, { borderColor: colors.border }]}>
          <Pressable style={styles.flex} onPress={() => onOpen(p.id)} accessibilityRole="button">
            <AppText variant="bodyStrong">{p.name}</AppText>
          </Pressable>
          <Pressable
            onPress={() => openExternalUrl(googleMapsUrl({ name: p.name, city: p.city, address: null, google_place_id: null }))}
            accessibilityRole="link">
            <AppText tone="primary">📍</AppText>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  flex: { flex: 1 },
});
