import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { FadeIn } from '@/components/Motion';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { useLibraryPlaces, useLibraryRecipes } from '@/features/library/api';
import { fromISODate, toISODate } from '@/features/planner/dates';
import { useProfileSettings } from '@/features/portions/api';
import { useCookLog, useWeekKcal } from '@/features/stats/api';
import { cookedThisMonth, cookingStreak, favoriteRecipe, lastWeekKcal, libraryCounts, topTags } from '@/features/stats/logic';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

const WEEKDAYS = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];

/** Le tue statistiche: quanto cucini, cosa ti piace, calorie della settimana. */
export default function StatsScreen() {
  const { t } = useTranslation();
  const today = toISODate(new Date());
  const recipes = useLibraryRecipes();
  const places = useLibraryPlaces();
  const cooks = useCookLog();
  const week = useWeekKcal(today);
  const goal = useProfileSettings().data?.kcal_goal ?? null;

  const stats = useMemo(() => {
    if (!recipes.data || !places.data || !cooks.data || !week.data) return null;
    return {
      month: cookedThisMonth(cooks.data, today),
      streak: cookingStreak(cooks.data, today),
      tags: topTags(recipes.data, cooks.data),
      favorite: favoriteRecipe(recipes.data, cooks.data),
      week: lastWeekKcal(week.data, today),
      counts: libraryCounts(recipes.data, places.data),
    };
  }, [recipes.data, places.data, cooks.data, week.data, today]);

  const failed = [recipes, places, cooks, week].find((q) => q.isError);
  let body;
  if (failed) body = <ErrorState message={errorMessage(failed.error, t)} onRetry={() => failed.refetch()} />;
  else if (!stats) body = <LoadingState />;
  else {
    const diff = stats.month.now - stats.month.before;
    body = (
      <>
        <View style={styles.tiles}>
          <Tile index={0} value={String(stats.month.now)} label={t('stats.cookedMonth')} note={stats.month.before ? t(diff >= 0 ? 'stats.moreThanLast' : 'stats.lessThanLast', { count: Math.abs(diff) }) : null} />
          <Tile index={1} value={stats.streak ? `🔥 ${stats.streak}` : '0'} label={t('stats.streak')} />
          <Tile index={2} value={String(stats.counts.recipes)} label={t('stats.recipes')} note={t('stats.tried', { count: stats.counts.triedRecipes })} />
          <Tile index={3} value={String(stats.counts.places)} label={t('stats.places')} note={t('stats.visited', { count: stats.counts.visitedPlaces })} />
        </View>

        {stats.favorite ? (
          <FadeIn index={4}>
            <Section title={t('stats.favorite')}>
              <AppText variant="heading">{stats.favorite.title}</AppText>
              <AppText tone="secondary">{t('stats.times', { count: stats.favorite.times })}</AppText>
            </Section>
          </FadeIn>
        ) : null}

        <Section title={t('stats.tagsTitle')}>
          {stats.tags.length ? <HBars items={stats.tags} /> : <AppText tone="secondary">{t('stats.noTags')}</AppText>}
        </Section>

        <Section title={t('stats.kcalTitle')}>
          <WeekBars days={stats.week.days} goal={goal} today={today} />
          <AppText tone="secondary">
            {stats.week.average !== null
              ? t('stats.kcalAverage', { kcal: stats.week.average }) + (goal ? ` · ${t('stats.kcalGoal', { goal })}` : '')
              : t('stats.kcalNone')}
          </AppText>
        </Section>

        {stats.counts.averageRating ? (
          <AppText tone="secondary">{t('stats.averageRating', { rating: String(stats.counts.averageRating).replace('.', ',') })}</AppText>
        ) : null}
        <AppText variant="caption" tone="secondary">
          {t('stats.historyNote')}
        </AppText>
      </>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.container}>
        <BackButton />
        <AppText variant="title">{t('stats.title')}</AppText>
        {body}
      </View>
    </Screen>
  );
}

function Tile({ value, label, note, index }: { value: string; label: string; note?: string | null; index: number }) {
  const { colors } = useTheme();
  return (
    <FadeIn index={index} style={styles.tileWrap}>
      <View style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <AppText variant="title">{value}</AppText>
        <AppText variant="bodyStrong">{label}</AppText>
        {note ? (
          <AppText variant="caption" tone="secondary">
            {note}
          </AppText>
        ) : null}
      </View>
    </FadeIn>
  );
}

/** Barre orizzontali (una sola serie: un colore, etichette e valori in colore testo). */
function HBars({ items }: { items: { label: string; count: number }[] }) {
  const { colors } = useTheme();
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <View style={styles.hbars}>
      {items.map((item) => (
        <View key={item.label} style={styles.hbarRow} accessible accessibilityLabel={`${item.label}: ${item.count}`}>
          <AppText style={styles.hbarLabel} numberOfLines={1}>
            {item.label}
          </AppText>
          <View style={styles.hbarTrack}>
            <View style={[styles.hbar, { width: `${(item.count / max) * 100}%`, backgroundColor: colors.primary }]} />
          </View>
          <AppText variant="bodyStrong" style={styles.hbarValue}>
            {item.count}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/** Colonne dei 7 giorni; il giorno oltre l'obiettivo è segnato, oggi ha il valore scritto. */
function WeekBars({ days, goal, today }: { days: { date: string; kcal: number }[]; goal: number | null; today: string }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const max = Math.max(goal ?? 0, ...days.map((d) => d.kcal), 1);
  const HEIGHT = 120;
  return (
    <View>
      <View style={[styles.cols, { height: HEIGHT }]}>
        {goal ? (
          <View style={[styles.goalLine, { bottom: (goal / max) * (HEIGHT - 20), borderColor: colors.textSecondary }]} pointerEvents="none" />
        ) : null}
        {days.map((d) => (
          <View
            key={d.date}
            style={styles.col}
            accessible
            accessibilityLabel={`${d.date}: ${d.kcal} kcal`}>
            {d.date === today && d.kcal ? (
              <AppText variant="caption" style={styles.colValue}>
                {d.kcal}
              </AppText>
            ) : null}
            <View
              style={[
                styles.colBar,
                {
                  height: Math.max(d.kcal ? 4 : 2, (d.kcal / max) * (HEIGHT - 20)),
                  backgroundColor: d.kcal ? (goal && d.kcal > goal ? colors.danger : colors.primary) : colors.border,
                },
              ]}
            />
          </View>
        ))}
      </View>
      <View style={styles.colLabels}>
        {days.map((d) => (
          <AppText key={d.date} variant="caption" tone={d.date === today ? 'default' : 'secondary'} style={styles.colLabel}>
            {d.date === today ? t('stats.todayShort') : WEEKDAYS[fromISODate(d.date).getDay()]}
          </AppText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tileWrap: { flexBasis: '46%', flexGrow: 1 },
  tile: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, gap: 2 },
  hbars: { gap: spacing.sm },
  hbarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hbarLabel: { width: 110 },
  hbarTrack: { flex: 1, height: 14, justifyContent: 'center' },
  hbar: { height: 14, borderTopRightRadius: 4, borderBottomRightRadius: 4, minWidth: 4 },
  hbarValue: { width: 32, textAlign: 'right' },
  cols: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, position: 'relative' },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  colBar: { width: '70%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  colValue: { marginBottom: 2 },
  goalLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed' },
  colLabels: { flexDirection: 'row', gap: 2, marginTop: spacing.xs },
  colLabel: { flex: 1, textAlign: 'center' },
});
