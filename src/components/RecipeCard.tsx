import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import type { LibraryRecipe } from '@/features/library/filter';
import { starsText } from '@/features/ratings/format';
import { formatMinutes } from '@/features/recipes/format';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

/** Card con foto grande per una ricetta della Libreria. */
export function RecipeCard({ recipe: r, onPress }: { recipe: LibraryRecipe; onPress: () => void }) {
  const { colors } = useTheme();
  const facts = [
    r.total_minutes ? `⏱ ${formatMinutes(r.total_minutes)}` : null,
    r.kcal_per_serving ? `${r.kcal_per_serving} kcal` : null,
  ].filter(Boolean);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={r.title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}>
      <View style={[styles.imageWrap, { backgroundColor: colors.surfaceMuted }]}>
        {r.image_url ? (
          <Image source={{ uri: r.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <Icon name={{ ios: 'fork.knife', android: 'restaurant' }} size={40} color={colors.textSecondary} />
        )}
      </View>
      <View style={styles.body}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {r.title}
        </AppText>
        {facts.length ? (
          <AppText variant="caption" tone="secondary" numberOfLines={1}>
            {facts.join(' · ')}
          </AppText>
        ) : null}
        {r.rating || r.status === 'tried' ? (
          <AppText variant="caption" style={{ color: '#D99A00' }} numberOfLines={1}>
            {r.rating ? starsText(r.rating) : '✓'}
          </AppText>
        ) : null}
        {r.tags.length ? (
          <AppText variant="caption" tone="primary" numberOfLines={1}>
            {r.tags.slice(0, 3).join(' · ')}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  imageWrap: { aspectRatio: 4 / 5, alignItems: 'center', justifyContent: 'center' },
  body: { padding: spacing.md, gap: spacing.xs },
});
