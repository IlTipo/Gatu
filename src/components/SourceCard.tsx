import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { displayHost } from '@/features/sources/helpers';
import type { Source } from '@/features/sources/types';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { PlatformBadge } from './PlatformBadge';

/** Card con foto grande per un link salvato. */
export function SourceCard({ source, onPress }: { source: Source; onPress: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const title = source.title || displayHost(source.url) || t('source.noTitle');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}>
      <View style={[styles.imageWrap, { backgroundColor: colors.surfaceMuted }]}>
        {source.thumbnail_url ? (
          <Image source={{ uri: source.thumbnail_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <Icon name={{ ios: 'fork.knife', android: 'restaurant' }} size={40} color={colors.textSecondary} />
        )}
      </View>
      <View style={styles.body}>
        <PlatformBadge platform={source.platform} />
        <AppText variant="bodyStrong" numberOfLines={2}>
          {title}
        </AppText>
        {source.author_name ? (
          <AppText variant="caption" tone="secondary" numberOfLines={1}>
            {source.author_name}
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
