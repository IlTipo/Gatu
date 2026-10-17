import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { BackButton } from '@/components/BackButton';
import { Chip } from '@/components/Chip';
import { FadeIn, PressableScale } from '@/components/Motion';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { PersonRow } from '@/components/social/PersonRow';
import {
  type Notification,
  useFollowRequests,
  useMarkNotificationsRead,
  useNotifications,
  useRespondFollow,
} from '@/features/social/network';
import { timeAgo } from '@/features/social/time';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

/** ❤️ Notifiche: richieste da accettare in cima, poi mi piace, commenti e nuovi follower. */
export default function NotificationsScreen() {
  const { t } = useTranslation();
  const list = useNotifications();
  const requests = useFollowRequests();
  const markRead = useMarkNotificationsRead();
  const respond = useRespondFollow();

  // aprendo la pagina, le notifiche diventano "lette"
  const hasUnread = !!list.data?.some((n) => !n.read);
  useEffect(() => {
    if (hasUnread) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnread]);

  let body;
  if (list.isPending) body = <LoadingState />;
  else if (list.isError) body = <ErrorState message={errorMessage(list.error, t)} onRetry={() => list.refetch()} />;
  else if (!list.data.length && !requests.data?.length) body = <EmptyState title={t('social.noNotifications')} body={t('social.noNotificationsBody')} />;
  else body = list.data.map((n, i) => <FadeIn key={n.id} index={i}><NotificationRow n={n} /></FadeIn>);

  return (
    <Screen scroll>
      <View style={styles.container}>
        <BackButton />
        <AppText variant="title">{t('social.notifications')}</AppText>
        {requests.data?.length ? (
          <Section title={t('social.followRequests')}>
            {requests.data.map((p) => (
              <PersonRow
                key={p.id}
                person={p}
                right={
                  <View style={styles.actions}>
                    <Chip label={t('friends.accept')} selected onPress={() => respond.mutate({ userId: p.id, accept: true })} />
                    <Chip label="✕" onPress={() => respond.mutate({ userId: p.id, accept: false })} />
                  </View>
                }
              />
            ))}
          </Section>
        ) : null}
        {body}
      </View>
    </Screen>
  );
}

function NotificationRow({ n }: { n: Notification }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const who = `@${n.username ?? '…'}`;
  const text =
    n.kind === 'like'
      ? t('social.n.like', { who, recipe: n.recipe_title ?? '' })
      : n.kind === 'comment'
        ? t('social.n.comment', { who, recipe: n.recipe_title ?? '' })
        : n.kind === 'follow'
          ? t('social.n.follow', { who })
          : n.kind === 'follow_request'
            ? t('social.n.followRequest', { who })
            : n.kind === 'follow_accepted'
              ? t('social.n.followAccepted', { who })
              : t('social.n.friendRequest', { who });
  const open = () => {
    if (n.recipe_id) router.push({ pathname: '/friend/recipe/[id]', params: { id: n.recipe_id } });
    else if (n.kind === 'friend_request') router.push('/friends');
    else router.push({ pathname: '/u/[id]', params: { id: n.actor_id } });
  };
  return (
    <PressableScale
      onPress={open}
      accessibilityRole="button"
      style={[styles.row, { backgroundColor: n.read ? colors.surface : colors.surfaceMuted, borderColor: colors.border }]}>
      <Avatar url={n.avatar_url} name={n.display_name ?? n.username} size={40} />
      <View style={styles.flex}>
        <AppText>{text}</AppText>
        {n.comment ? (
          <AppText tone="secondary" numberOfLines={2}>
            “{n.comment}”
          </AppText>
        ) : null}
        <AppText variant="caption" tone="secondary">
          {timeAgo(n.created_at)}
        </AppText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1 },
  actions: { flexDirection: 'row', gap: spacing.xs },
  flex: { flex: 1, gap: 2 },
});
