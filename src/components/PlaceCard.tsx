import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import type { LibraryPlace } from '@/features/library/filter';
import { priceLabel } from '@/features/places/format';
import { starsText } from '@/features/ratings/format';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

/** Card per un posto della Libreria. */
export function PlaceCard({ place: p, onPress }: { place: LibraryPlace; onPress: () => void }) {
  const { colors } = useTheme();
  const details = [p.cuisine, priceLabel(p.price_level)].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={p.name}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}>
      <View style={[styles.imageWrap, { backgroundColor: colors.surfaceMuted }]}>
        {p.image_url ? (
          <Image source={{ uri: p.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <Icon name={{ ios: 'mappin.and.ellipse', android: 'place' }} size={40} color={colors.textSecondary} />
        )}
        {p.wishlist ? (
          <View style={[styles.badge, { backgroundColor: colors.surface }]}>
            <AppText variant="caption">❤️</AppText>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {p.name}
        </AppText>
        {p.city ? (
          <AppText variant="caption" tone="secondary" numberOfLines={1}>
            📍 {p.city}
          </AppText>
        ) : null}
        {p.rating || p.status === 'tried' ? (
          <AppText variant="caption" style={{ color: colors.star }} numberOfLines={1}>
            {p.rating ? starsText(p.rating) : '✓'}
          </AppText>
        ) : null}
        {details ? (
          <AppText variant="caption" tone="primary" numberOfLines={1}>
            {details}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  imageWrap: { aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: spacing.sm, right: spacing.sm, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  body: { padding: spacing.md, gap: spacing.xs },
});
