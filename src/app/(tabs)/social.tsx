import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { FadeIn, PressableScale } from '@/components/Motion';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { PostCard } from '@/components/social/PostCard';
import { useMyProfile } from '@/features/social/api';
import { useFeed, useFollowRequests, useUnreadCount } from '@/features/social/network';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

/** Scheda Social: Novità di chi segui, cerca persone, notifiche, il tuo profilo. */
export default function SocialScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const me = useMyProfile();
  const feed = useFeed();
  const unread = useUnreadCount();
  const requests = useFollowRequests();
  const posts = feed.data?.pages.flat() ?? [];

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <AppText variant="title" style={styles.flex}>
          {t('social.title')}
        </AppText>
        <IconButton label="❤️" a11y={t('social.notifications')} badge={unread.data ?? 0} onPress={() => router.push('/notifications')} />
      </View>
      <PressableScale
        onPress={() => router.push('/search')}
        accessibilityRole="search"
        style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <AppText tone="secondary">🔍 {t('social.searchPlaceholder')}</AppText>
      </PressableScale>
      <PressableScale
        onPress={() => router.push({ pathname: '/u/[id]', params: { id: 'me' } })}
        accessibilityRole="button"
        style={[styles.me, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Avatar url={me.data?.avatar_url} name={me.data?.display_name ?? me.data?.username} size={40} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong">@{me.data?.username ?? '…'}</AppText>
          <AppText variant="caption" tone="secondary">
            {t('social.myProfile')}
          </AppText>
        </View>
        <AppText variant="heading" tone="secondary">
          ›
        </AppText>
      </PressableScale>
      {requests.data?.length ? (
        <Button
          label={t('social.requestsButton', { count: requests.data.length })}
          variant="secondary"
          onPress={() => router.push('/notifications')}
        />
      ) : null}
      <AppText variant="heading">{t('social.news')}</AppText>
    </View>
  );

  let empty: React.ReactElement | undefined;
  if (feed.isPending) empty = <LoadingState />;
  else if (feed.isError) empty = <ErrorState message={errorMessage(feed.error, t)} onRetry={() => feed.refetch()} />;
  else if (!posts.length)
    empty = (
      <EmptyState
        title={t('social.emptyTitle')}
        body={t('social.emptyBody')}
        action={<Button label={t('social.findPeople')} onPress={() => router.push('/search')} />}
      />
    );

  return (
    <Screen>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => (
          <FadeIn index={index}>
            <PostCard post={item} />
          </FadeIn>
        )}
        onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
        onEndReachedThreshold={0.5}
        ListFooterComponent={feed.isFetchingNextPage ? <LoadingState /> : undefined}
      />
    </Screen>
  );
}

function IconButton({ label, a11y, badge, onPress }: { label: string; a11y: string; badge: number; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={8} style={styles.iconButton}>
      <AppText variant="heading">{label}</AppText>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          <AppText variant="caption" tone="onPrimary" style={styles.badgeText}>
            {badge > 9 ? '9+' : badge}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md, paddingBottom: spacing.xl },
  header: { gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  search: { padding: spacing.md, borderRadius: radius.pill, borderWidth: 1 },
  me: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 0, right: 0, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { fontSize: 11, lineHeight: 14, fontWeight: '700' },
  flex: { flex: 1 },
});
