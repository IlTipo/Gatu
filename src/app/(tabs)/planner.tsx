import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, type ScrollViewInstance, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CaloriesPanel } from '@/components/CaloriesPanel';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/StateViews';
import { useLibraryRecipes } from '@/features/library/api';
import type { LibraryRecipe } from '@/features/library/filter';
import {
  useClearWeek,
  useCopyPreviousWeek,
  useRemoveMeal,
  useUpdateMeal,
  useWeekPlan,
} from '@/features/planner/api';
import { addDays, dayLabel, SLOTS, startOfWeek, toISODate, weekDays, weekLabel } from '@/features/planner/dates';
import { groupWeek, mealServings } from '@/features/planner/helpers';
import type { MealEntry } from '@/features/planner/types';
import { formatMinutes } from '@/features/recipes/format';
import { confirm } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

export default function PlannerScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const today = toISODate(new Date());
  const [monday, setMonday] = useState(() => startOfWeek(today));
  const plan = useWeekPlan(monday);
  const recipes = useLibraryRecipes();
  const copy = useCopyPreviousWeek(monday);
  const clear = useClearWeek(monday);
  const [message, setMessage] = useState<string | null>(null);
  const scroller = useRef<ScrollViewInstance>(null);
  const scrolledFor = useRef<string | null>(null);

  const byId = useMemo(() => new Map((recipes.data ?? []).map((r) => [r.id, r])), [recipes.data]);
  const week = useMemo(() => groupWeek(plan.data ?? []), [plan.data]);
  const isThisWeek = monday === startOfWeek(today);

  // calorie stimate A PERSONA (una porzione di ogni pasto del giorno)
  const dayKcal = (date: string) => {
    const meals = (plan.data ?? []).filter((m) => m.date === date);
    let total = 0;
    let missing = 0;
    for (const m of meals) {
      const k = byId.get(m.recipe_id)?.kcal_per_serving;
      if (k) total += k;
      else missing++;
    }
    return { total, missing, meals: meals.length };
  };
  const weekNutrition = (() => {
    const days = weekDays(monday).map(dayKcal).filter((d) => d.total > 0);
    const missing = weekDays(monday).reduce((n, d) => n + dayKcal(d).missing, 0);
    return {
      days: days.length,
      average: days.length ? Math.round(days.reduce((sum, d) => sum + d.total, 0) / days.length) : 0,
      missing,
    };
  })();

  const goWeek = (delta: number) => {
    setMessage(null);
    setMonday(addDays(monday, delta * 7));
  };
  const copyPrevious = () =>
    copy.mutate(undefined, {
      onSuccess: (n) => setMessage(n ? t('planner.copied', { count: n }) : t('planner.nothingToCopy')),
    });
  const clearWeek = async () => {
    if (await confirm(t('planner.clearConfirm'), { ok: t('common.delete'), cancel: t('common.cancel') })) {
      clear.mutate();
    }
  };

  let body;
  if (plan.isPending || recipes.isPending) body = <LoadingState />;
  else if (plan.isError) body = <ErrorState message={errorMessage(plan.error, t)} onRetry={() => plan.refetch()} />;
  else if (recipes.isError) body = <ErrorState message={errorMessage(recipes.error, t)} onRetry={() => recipes.refetch()} />;
  else {
    const count = plan.data.length;
    body = (
      <View style={styles.days}>
        <CaloriesPanel />
        {count ? (
          <AppText tone="secondary">{t('planner.summary', { count })}</AppText>
        ) : (
          <AppText tone="secondary">{t('planner.emptyHint')}</AppText>
        )}
        {weekNutrition.days ? (
          <AppText tone="secondary">
            {t('planner.weekKcal', { kcal: weekNutrition.average, count: weekNutrition.days })}
            {weekNutrition.missing ? ` ${t('planner.weekKcalMissing', { count: weekNutrition.missing })}` : ''}
          </AppText>
        ) : null}
        {weekDays(monday).map((date) => {
          const isToday = date === today;
          const day = week.get(date);
          const kcal = dayKcal(date);
          return (
            <View
              key={date}
              onLayout={(e) => {
                // apre la settimana corrente su oggi (una volta sola)
                if (isToday && scrolledFor.current !== monday && e.nativeEvent.layout.y > 0) {
                  scrolledFor.current = monday;
                  scroller.current?.scrollTo({ y: e.nativeEvent.layout.y, animated: false });
                }
              }}
              style={[
                styles.day,
                { backgroundColor: colors.surface, borderColor: isToday ? colors.primary : colors.border },
              ]}>
              <AppText variant="heading">
                {dayLabel(date)}
                {kcal.total ? (
                  <AppText variant="caption" tone="secondary">
                    {'  '}~{kcal.total} kcal
                  </AppText>
                ) : null}
                {isToday ? (
                  <AppText variant="caption" tone="primary">
                    {'  '}
                    {t('planner.today')}
                  </AppText>
                ) : null}
              </AppText>
              {SLOTS.map((slot) => (
                <View key={slot} style={styles.slot}>
                  <AppText variant="caption" tone="secondary" style={styles.slotTitle}>
                    {t(`planner.${slot}`)}
                  </AppText>
                  {(day?.[slot] ?? []).map((entry) => (
                    <MealRow key={entry.id} entry={entry} recipe={byId.get(entry.recipe_id)} />
                  ))}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('planner.add')} · ${dayLabel(date)} · ${t(`planner.${slot}`)}`}
                    onPress={() => router.push({ pathname: '/plan/add', params: { date, slot } })}
                    hitSlop={4}>
                    <AppText variant="bodyStrong" tone="primary">
                      {t('planner.add')}
                    </AppText>
                  </Pressable>
                </View>
              ))}
            </View>
          );
        })}
        <View style={styles.actions}>
          {count ? (
            <Button label={t('planner.shopping')} onPress={() => router.push('/shopping')} />
          ) : null}
          <Button label={t('planner.copyPrevious')} variant="secondary" onPress={copyPrevious} loading={copy.isPending} />
          {count ? <Button label={t('planner.clear')} variant="ghost" onPress={clearWeek} loading={clear.isPending} /> : null}
          {message ? <AppText tone="secondary">{message}</AppText> : null}
          <InlineError message={copy.isError ? errorMessage(copy.error, t) : clear.isError ? errorMessage(clear.error, t) : null} />
        </View>
      </View>
    );
  }

  return (
    <Screen>
      <AppText variant="title">{t('planner.title')}</AppText>
      <View style={styles.weekNav}>
        <NavArrow label={t('planner.prevWeek')} symbol="‹" onPress={() => goWeek(-1)} />
        <View style={styles.weekCenter}>
          <AppText variant="bodyStrong">{weekLabel(monday)}</AppText>
          {!isThisWeek ? (
            <Pressable onPress={() => setMonday(startOfWeek(today))} accessibilityRole="button">
              <AppText variant="caption" tone="primary">
                {t('planner.thisWeek')}
              </AppText>
            </Pressable>
          ) : null}
        </View>
        <NavArrow label={t('planner.nextWeek')} symbol="›" onPress={() => goWeek(1)} />
      </View>
      <ScrollView ref={scroller} contentContainerStyle={styles.scroll}>
        {body}
      </ScrollView>
    </Screen>
  );
}

function NavArrow({ label, symbol, onPress }: { label: string; symbol: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.arrow, { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.6 : 1 }]}>
      <AppText variant="heading">{symbol}</AppText>
    </Pressable>
  );
}

/** Un pasto: ricetta, persone (− +), sposta, togli. */
function MealRow({ entry, recipe }: { entry: MealEntry; recipe: LibraryRecipe | undefined }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const update = useUpdateMeal();
  const remove = useRemoveMeal();
  const people = mealServings(entry, recipe?.servings);
  const setPeople = (n: number) => update.mutate({ id: entry.id, patch: { servings: Math.min(20, Math.max(1, n)) } });

  return (
    <View style={[styles.meal, { backgroundColor: colors.surfaceMuted, opacity: remove.isPending ? 0.5 : 1 }]}>
      <Pressable
        style={styles.mealMain}
        accessibilityRole="button"
        disabled={!recipe}
        onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: entry.recipe_id } })}>
        <View style={[styles.thumb, { backgroundColor: colors.surface }]}>
          {recipe?.image_url ? (
            <Image source={{ uri: recipe.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <Icon name={{ ios: 'fork.knife', android: 'restaurant' }} size={20} color={colors.textSecondary} />
          )}
        </View>
        <View style={styles.flex}>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {recipe?.title ?? t('planner.missingRecipe')}
          </AppText>
          {recipe?.total_minutes ? (
            <AppText variant="caption" tone="secondary">
              ⏱ {formatMinutes(recipe.total_minutes)}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.mealActions}>
        <Small label="−" a11y={t('planner.fewer')} onPress={() => setPeople(people - 1)} disabled={people <= 1} />
        <AppText variant="caption" style={styles.people}>
          {t('planner.people', { count: people })}
        </AppText>
        <Small label="+" a11y={t('planner.more')} onPress={() => setPeople(people + 1)} disabled={people >= 20} />
        <View style={styles.flex} />
        <Small
          label={t('planner.move')}
          onPress={() => router.push({ pathname: '/plan/add', params: { moveId: entry.id, recipeId: entry.recipe_id } })}
        />
        <Small label="✕" a11y={t('planner.remove')} onPress={() => remove.mutate(entry.id)} />
      </View>
      <InlineError
        message={update.isError ? errorMessage(update.error, t) : remove.isError ? errorMessage(remove.error, t) : null}
      />
    </View>
  );
}

function Small({ label, a11y, onPress, disabled }: { label: string; a11y?: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      hitSlop={4}
      style={({ pressed }) => [
        styles.small,
        { borderColor: colors.border, backgroundColor: colors.surface, opacity: disabled ? 0.35 : pressed ? 0.6 : 1 },
      ]}>
      <AppText variant="bodyStrong">{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  weekNav: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md },
  weekCenter: { flex: 1, alignItems: 'center', gap: 2 },
  arrow: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: spacing.xl * 2 },
  days: { gap: spacing.md },
  day: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  slot: { gap: spacing.sm },
  slotTitle: { textTransform: 'uppercase', letterSpacing: 0.6 },
  meal: { gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md },
  mealMain: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  mealActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  people: { minWidth: 72, textAlign: 'center' },
  small: { minWidth: 36, height: 34, paddingHorizontal: spacing.sm, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  flex: { flex: 1, gap: 2 },
});
