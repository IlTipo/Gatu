import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatMinutes } from '@/features/recipes/format';
import type { FeedPost } from '@/features/social/network';
import { timeAgo } from '@/features/social/time';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from '../AppText';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { PressableScale } from '../Motion';

/** Un post delle Novità: autore, foto grande, titolo, ❤️ e 💬. */
export function PostCard({ post: p }: { post: FeedPost }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const open = () => router.push({ pathname: '/friend/recipe/[id]', params: { id: p.id } });
  const facts = [p.homemade ? t('friendsRecipes.homemadeShort') : null, p.total_minutes ? `⏱ ${formatMinutes(p.total_minutes)}` : null, p.kcal_per_serving ? `${p.kcal_per_serving} kcal` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable
        onPress={() => router.push({ pathname: '/u/[id]', params: { id: p.author_id } })}
        accessibilityRole="button"
        style={styles.author}>
        <Avatar url={p.avatar_url} name={p.display_name ?? p.username} size={34} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            @{p.username}
          </AppText>
          <AppText variant="caption" tone="secondary">
            {timeAgo(p.created_at)}
          </AppText>
        </View>
      </Pressable>
      <PressableScale onPress={open} scaleTo={0.98} accessibilityRole="button" accessibilityLabel={p.title}>
        <View style={[styles.image, { backgroundColor: colors.surfaceMuted }]}>
          {p.image_url ? (
            <Image source={{ uri: p.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          ) : (
            <Icon name={{ ios: 'fork.knife', android: 'restaurant' }} size={40} color={colors.textSecondary} />
          )}
        </View>
        <View style={styles.body}>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {p.title}
          </AppText>
          {facts ? (
            <AppText variant="caption" tone="secondary">
              {facts}
            </AppText>
          ) : null}
          <AppText variant="caption" tone="secondary">
            {p.liked ? '❤️' : '🤍'} {p.likes} · 💬 {p.comments}
          </AppText>
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  author: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
  image: { width: '100%', aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  body: { padding: spacing.md, gap: spacing.xs },
  flex: { flex: 1 },
});
