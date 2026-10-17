import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { SearchBar } from '@/components/SearchBar';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/StateViews';
import { useLibraryRecipes } from '@/features/library/api';
import { filterRecipes, type LibraryRecipe } from '@/features/library/filter';
import { pickRandom } from '@/features/library/pantry';
import { useAddMeal, useUpdateMeal } from '@/features/planner/api';
import {
  addDays,
  dayLabel,
  isValidISODate,
  nextMealSlot,
  type Slot,
  SLOTS,
  startOfWeek,
  toISODate,
  weekDays,
  weekLabel,
} from '@/features/planner/dates';
import { formatMinutes } from '@/features/recipes/format';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

const isSlot = (v: unknown): v is Slot => v === 'lunch' || v === 'dinner';
const close = () => (router.canGoBack() ? router.back() : router.replace('/planner'));

/**
 * Tre usi:
 *  /plan/add?date=…&slot=…        → scegli la ricetta per quel pasto
 *  /plan/add?recipeId=…           → scegli il giorno per questa ricetta
 *  /plan/add?moveId=…&recipeId=…  → sposta un pasto in un altro giorno
 */
export default function PlanAddScreen() {
  const params = useLocalSearchParams<{ date?: string; slot?: string; recipeId?: string; moveId?: string }>();
  if (isValidISODate(params.date) && isSlot(params.slot)) return <PickRecipe date={params.date} slot={params.slot} />;
  if (params.recipeId) return <PickSlot recipeId={params.recipeId} moveId={params.moveId ?? null} />;
  return <PickRecipe {...nextMealSlot()} />;
}

function PickRecipe({ date, slot }: { date: string; slot: Slot }) {
  const { t } = useTranslation();
  const recipes = useLibraryRecipes();
  const add = useAddMeal();
  const [query, setQuery] = useState('');
  const visible = useMemo(
    () => filterRecipes(recipes.data ?? [], { query, tags: [], collection: null }),
    [recipes.data, query],
  );

  const choose = (r: LibraryRecipe) =>
    add.mutate({ date, slot, recipeId: r.id, servings: r.servings ?? 2 }, { onSuccess: close });

  let body;
  if (recipes.isPending) body = <LoadingState />;
  else if (recipes.isError) body = <ErrorState message={errorMessage(recipes.error, t)} onRetry={() => recipes.refetch()} />;
  else if (!recipes.data.length) body = <EmptyState title={t('planner.noRecipes')} />;
  else
    body = (
      <View style={styles.list}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder={t('library.searchPlaceholder')}
          label={t('library.search')}
          clearLabel={t('library.clearSearch')}
        />
        <Button
          label={t('planner.random')}
          variant="secondary"
          onPress={() => {
            const r = pickRandom(visible, null);
            if (r) choose(r);
          }}
          disabled={!visible.length || add.isPending}
        />
        <InlineError message={add.isError ? errorMessage(add.error, t) : null} />
        {visible.length ? (
          visible.slice(0, 100).map((r) => <RecipeRow key={r.id} recipe={r} onPress={() => choose(r)} disabled={add.isPending} />)
        ) : (
          <AppText tone="secondary">{t('planner.noMatch')}</AppText>
        )}
      </View>
    );

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.container}>
        <Pressable onPress={close} accessibilityRole="button" hitSlop={8}>
          <AppText variant="bodyStrong" tone="primary">
            {t('common.cancel')}
          </AppText>
        </Pressable>
        <View style={styles.block}>
          <AppText variant="caption" tone="primary">
            {dayLabel(date)} · {t(`planner.${slot}`)}
          </AppText>
          <AppText variant="title">{t('planner.pickRecipe')}</AppText>
        </View>
        {body}
      </View>
    </Screen>
  );
}

function RecipeRow({ recipe: r, onPress, disabled }: { recipe: LibraryRecipe; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={r.title}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed || disabled ? 0.6 : 1 },
      ]}>
      <View style={[styles.thumb, { backgroundColor: colors.surfaceMuted }]}>
        {r.image_url ? (
          <Image source={{ uri: r.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Icon name={{ ios: 'fork.knife', android: 'restaurant' }} size={20} color={colors.textSecondary} />
        )}
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {r.title}
        </AppText>
        <AppText variant="caption" tone="secondary" numberOfLines={1}>
          {[r.total_minutes ? `⏱ ${formatMinutes(r.total_minutes)}` : null, ...r.tags.slice(0, 2)].filter(Boolean).join(' · ')}
        </AppText>
      </View>
    </Pressable>
  );
}

function PickSlot({ recipeId, moveId }: { recipeId: string; moveId: string | null }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const recipes = useLibraryRecipes();
  const add = useAddMeal();
  const update = useUpdateMeal();
  const today = toISODate(new Date());
  const [monday, setMonday] = useState(() => startOfWeek(today));
  const recipe = recipes.data?.find((r) => r.id === recipeId);
  const [people, setPeople] = useState<number | null>(null);
  const servings = people ?? recipe?.servings ?? 2;
  const busy = add.isPending || update.isPending;
  const failure = add.error ?? update.error;

  const choose = (date: string, slot: Slot) => {
    if (moveId) update.mutate({ id: moveId, patch: { date, slot } }, { onSuccess: close });
    else add.mutate({ date, slot, recipeId, servings }, { onSuccess: close });
  };

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.container}>
        <Pressable onPress={close} accessibilityRole="button" hitSlop={8}>
          <AppText variant="bodyStrong" tone="primary">
            {t('common.cancel')}
          </AppText>
        </Pressable>
        <View style={styles.block}>
          {recipe ? (
            <AppText variant="caption" tone="primary" numberOfLines={1}>
              {recipe.title}
            </AppText>
          ) : null}
          <AppText variant="title">{moveId ? t('planner.moveTitle') : t('planner.pickSlot')}</AppText>
        </View>

        {!moveId ? (
          <View style={styles.block}>
            <AppText variant="caption" tone="secondary">
              {t('planner.servingsLabel')}
            </AppText>
            <View style={styles.chips}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <Chip key={n} label={String(n)} selected={servings === n} onPress={() => setPeople(n)} />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.weekNav}>
          <Chip label="‹" onPress={() => setMonday(addDays(monday, -7))} />
          <AppText variant="bodyStrong" style={styles.weekLabel}>
            {weekLabel(monday)}
          </AppText>
          <Chip label="›" onPress={() => setMonday(addDays(monday, 7))} />
        </View>

        <InlineError message={failure ? errorMessage(failure, t) : null} />
        {weekDays(monday).map((date) => (
          <View
            key={date}
            style={[styles.dayRow, { borderColor: date === today ? colors.primary : colors.border, backgroundColor: colors.surface }]}>
            <AppText variant="bodyStrong" style={styles.dayName}>
              {dayLabel(date)}
            </AppText>
            {SLOTS.map((slot) => (
              <Pressable
                key={slot}
                onPress={() => choose(date, slot)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`${dayLabel(date)} · ${t(`planner.${slot}`)}`}
                style={({ pressed }) => [
                  styles.slotButton,
                  { backgroundColor: colors.surfaceMuted, opacity: pressed || busy ? 0.6 : 1 },
                ]}>
                <AppText variant="bodyStrong">{t(`planner.${slot}`)}</AppText>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  block: { gap: spacing.xs },
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1 },
  thumb: { width: 52, height: 52, borderRadius: radius.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  weekNav: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  weekLabel: { flex: 1, textAlign: 'center' },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1 },
  dayName: { flex: 1 },
  slotButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  flex: { flex: 1, gap: 2 },
});
