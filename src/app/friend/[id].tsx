import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { FadeIn, PressableScale } from '@/components/Motion';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { ErrorState, InlineError, LoadingState } from '@/components/StateViews';
import { dayTotals } from '@/features/diary/logic';
import { dayLabel, toISODate } from '@/features/planner/dates';
import { starsText } from '@/features/ratings/format';
import { type FriendFeed, useFriendFeed, useRemoveFriend } from '@/features/social/api';
import { confirm } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

/** Cosa condivide un amico: ricette cucinate, planner dei prossimi giorni e (se vuole) cosa ha mangiato oggi. */
export default function FriendScreen() {
  const { t } = useTranslation();
  const { id, friendship } = useLocalSearchParams<{ id: string; friendship?: string }>();
  const today = toISODate(new Date());
  const feed = useFriendFeed(id, today);
  const remove = useRemoveFriend();

  const removeFriend = async () => {
    if (!friendship) return;
    if (await confirm(t('friends.removeConfirm'), { ok: t('friends.remove'), cancel: t('common.cancel') })) {
      remove.mutate(friendship, { onSuccess: () => router.back() });
    }
  };

  let body;
  if (feed.isPending) body = <LoadingState />;
  else if (feed.isError) body = <ErrorState message={t('friends.notAvailable')} onRetry={() => feed.refetch()} />;
  else body = <FeedBody feed={feed.data} />;

  return (
    <Screen scroll>
      <View style={styles.container}>
        <BackButton />
        <View style={styles.header}>
          <Avatar url={feed.data?.avatar_url} name={feed.data?.display_name} size={72} />
          <AppText variant="title" style={styles.flex}>
            {feed.data?.display_name ?? t('friends.someone')}
          </AppText>
        </View>
        {body}
        {friendship ? <Button label={t('friends.remove')} variant="ghost" onPress={removeFriend} loading={remove.isPending} /> : null}
        <InlineError message={remove.isError ? errorMessage(remove.error, t) : null} />
      </View>
    </Screen>
  );
}

function FeedBody({ feed }: { feed: FriendFeed }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const open = (recipeId: string) => router.push({ pathname: '/friend/recipe/[id]', params: { id: recipeId } });
  const days = [...new Set((feed.planner ?? []).map((m) => m.date))];
  const totals = dayTotals((feed.diary ?? []).map((d) => ({ kcal: d.kcal, protein_g: d.protein_g, carbs_g: null, fat_g: null })));

  return (
    <>
      {feed.creations?.length ? (
        <Section title={t('friends.creations')}>
          {feed.creations.map((r, i) => (
            <FadeIn key={r.id} index={i}>
              <PressableScale
                onPress={() => open(r.id)}
                accessibilityRole="button"
                style={[styles.item, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Thumb url={r.image_url} />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" numberOfLines={2}>
                    {r.title}
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    {[r.homemade ? t('friendsRecipes.homemadeShort') : null, r.kcal_per_serving ? `${r.kcal_per_serving} kcal` : null].filter(Boolean).join(' · ')}
                  </AppText>
                </View>
              </PressableScale>
            </FadeIn>
          ))}
        </Section>
      ) : null}
      <Section title={t('friends.cooked')}>
        {feed.cooked === null ? (
          <AppText tone="secondary">{t('friends.notShared')}</AppText>
        ) : feed.cooked.length ? (
          feed.cooked.map((r, i) => (
            <FadeIn key={r.id} index={i}>
              <PressableScale
                onPress={() => open(r.id)}
                accessibilityRole="button"
                style={[styles.item, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Thumb url={r.image_url} />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" numberOfLines={2}>
                    {r.title}
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    {[r.rating ? starsText(r.rating) : null, dayLabel(r.last_cooked_at.slice(0, 10)), r.kcal_per_serving ? `${r.kcal_per_serving} kcal` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </AppText>
                </View>
              </PressableScale>
            </FadeIn>
          ))
        ) : (
          <AppText tone="secondary">{t('friends.nothingCooked')}</AppText>
        )}
      </Section>

      <Section title={t('friends.planner')}>
        {feed.planner === null ? (
          <AppText tone="secondary">{t('friends.notShared')}</AppText>
        ) : days.length ? (
          days.map((date) => (
            <View key={date} style={styles.day}>
              <AppText variant="caption" tone="secondary" style={styles.dayTitle}>
                {dayLabel(date)}
              </AppText>
              {feed.planner!
                .filter((m) => m.date === date)
                .map((m) => (
                  <PressableScale
                    key={`${m.date}-${m.slot}-${m.recipe_id}`}
                    onPress={() => open(m.recipe_id)}
                    accessibilityRole="button"
                    style={[styles.item, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Thumb url={m.image_url} />
                    <View style={styles.flex}>
                      <AppText variant="caption" tone="secondary">
                        {t(`planner.${m.slot}`)}
                      </AppText>
                      <AppText variant="bodyStrong" numberOfLines={2}>
                        {m.title}
                      </AppText>
                    </View>
                  </PressableScale>
                ))}
            </View>
          ))
        ) : (
          <AppText tone="secondary">{t('friends.nothingPlanned')}</AppText>
        )}
      </Section>

      <Section title={t('friends.diary')}>
        {feed.diary === null ? (
          <AppText tone="secondary">{t('friends.notSharedDiary')}</AppText>
        ) : feed.diary.length ? (
          <>
            <AppText variant="bodyStrong">{t('friends.diaryTotal', { kcal: totals.kcal, protein: totals.protein })}</AppText>
            {feed.diary.map((d, i) => (
              <AppText key={i} tone="secondary">
                {t(`diary.times.${d.slot}` as 'diary.times.lunch')} · {d.name} · {d.kcal} kcal
              </AppText>
            ))}
          </>
        ) : (
          <AppText tone="secondary">{t('friends.nothingEaten')}</AppText>
        )}
      </Section>
    </>
  );
}

function Thumb({ url }: { url: string | null }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.thumb, { backgroundColor: colors.surfaceMuted }]}>
      {url ? (
        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <Icon name={{ ios: 'fork.knife', android: 'restaurant' }} size={20} color={colors.textSecondary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1 },
  thumb: { width: 52, height: 52, borderRadius: radius.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  day: { gap: spacing.sm },
  dayTitle: { textTransform: 'uppercase', letterSpacing: 0.6 },
  flex: { flex: 1, gap: 2 },
});
