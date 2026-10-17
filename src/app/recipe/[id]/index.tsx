import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { CollectionButton } from '@/components/CollectionButton';
import { Notice } from '@/components/Notice';
import { RatingCard } from '@/components/RatingCard';
import { RecipeSocial } from '@/components/social/RecipeSocial';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { VideoCard } from '@/components/VideoCard';
import { ErrorState, InlineError, LoadingState } from '@/components/StateViews';
import { useLogRecipe } from '@/features/diary/api';
import { mealTimeFor } from '@/features/diary/logic';
import { toISODate } from '@/features/planner/dates';
import { usePortionPrefs } from '@/features/portions/api';
import { type Nutrition, personalRecipe } from '@/features/portions/logic';
import { type DoseResult, type InsightsResult, useEstimateDoses, useRecipe, useDeleteRecipe, useRecipeInsights, useSetShared } from '@/features/recipes/api';
import { formatIngredient, formatMinutes, hasMissingDoses, scaleQuantity } from '@/features/recipes/format';
import type { RecipeWithDetails, VariantKind } from '@/features/recipes/types';
import { confirm } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';
import { openExternalUrl } from '@/lib/openUrl';
import { radius, spacing, useTheme } from '@/theme';

export default function RecipeScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipe = useRecipe(id);

  if (recipe.isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  if (recipe.isError) {
    return (
      <Screen>
        <BackButton />
        <ErrorState message={errorMessage(recipe.error, t)} onRetry={() => recipe.refetch()} />
      </Screen>
    );
  }

  return <RecipeDetails recipe={recipe.data} />;
}

const PEOPLE = [1, 2, 3, 4, 5, 6];
const VARIANT_KINDS: VariantKind[] = ['vegana', 'vegetariana', 'senza_glutine', 'senza_lattosio', 'light', 'veloce'];

function RecipeDetails({ recipe: r }: { recipe: RecipeWithDetails }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const estimate = useEstimateDoses(r.id);
  const setShared = useSetShared(r.id);
  const [doseMessage, setDoseMessage] = useState<string | null>(null);
  // persone scelte (di base quelle della ricetta)
  const [people, setPeople] = useState<number | null>(r.servings);
  const base = r.servings;
  const factor = base && people ? people / base : 1;
  // porzioni preferite del Profilo (es. pasta 100 g a persona)
  const prefs = usePortionPrefs();
  const mine = useMemo(() => personalRecipe(r, prefs), [r, prefs]);
  const missing = hasMissingDoses(r.servings, r.recipe_ingredients);
  const anyEstimated = r.recipe_ingredients.some((i) => i.estimated && i.quantity !== null);
  const choices = base && !PEOPLE.includes(base) ? [...PEOPLE, base] : PEOPLE;

  function runEstimate() {
    setDoseMessage(null);
    estimate.mutate(undefined, {
      onSuccess: (res: DoseResult) => {
        setDoseMessage(
          res.status === 'done'
            ? t('recipe.doseResult.done', { count: res.changed })
            : res.status === 'nothing_to_do'
            ? t('recipe.doseResult.nothing_to_do')
            : res.status === 'skipped'
            ? t(`recipe.doseResult.${res.reason}`)
            : res.reason === 'rate_limited'
            ? t('recipe.aiRateLimited')
            : t('recipe.doseResult.error'),
        );
        if (res.status === 'done' && res.servings && !people) setPeople(res.servings);
      },
    });
  }

  const facts = [
    r.servings ? `${t('recipe.servings', { count: r.servings })}${r.servings_estimated ? ' (~)' : ''}` : null,
    r.prep_minutes ? `${t('recipe.prep')} ${formatMinutes(r.prep_minutes)}` : null,
    r.cook_minutes ? `${t('recipe.cook')} ${formatMinutes(r.cook_minutes)}` : null,
    r.total_minutes ? `${t('recipe.total')} ${formatMinutes(r.total_minutes)}` : null,
  ].filter(Boolean);

  return (
    <Screen scroll>
      <View style={styles.container}>
        <BackButton />
        {r.image_url ? (
          <View style={[styles.image, { backgroundColor: colors.surfaceMuted }]}>
            <Image source={{ uri: r.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          </View>
        ) : null}

        <View style={styles.titleBlock}>
          <AppText variant="title">{r.title}</AppText>
          {r.description ? <AppText tone="secondary">{r.description}</AppText> : null}
          {facts.length ? <AppText variant="bodyStrong">{facts.join(' · ')}</AppText> : null}
          {r.tags.length ? (
            <View style={styles.chips}>
              {r.tags.map((tag) => <Chip key={tag} label={tag} />)}
            </View>
          ) : null}
          <View style={styles.chips}>
            {r.homemade ? <Chip label={t('recipe.homemade')} /> : null}
            <Chip
              label={r.shared_with_friends ? t('recipe.sharedBadge') : t('recipe.notShared')}
              selected={r.shared_with_friends}
              onPress={() => setShared.mutate(!r.shared_with_friends)}
            />
          </View>
        </View>

        <View style={styles.buttons}>
          <Button
            label={t('recipe.startCooking')}
            onPress={() => router.push({ pathname: '/recipe/[id]/cook', params: { id: r.id } })}
          />
          <Button
            label={t('common.edit')}
            variant="secondary"
            onPress={() => router.push({ pathname: '/recipe/[id]/edit', params: { id: r.id } })}
          />
          <Button
            label={t('planner.addToPlanner')}
            variant="secondary"
            onPress={() => router.push({ pathname: '/plan/add', params: { recipeId: r.id } })}
          />
          <CollectionButton target={{ recipeId: r.id }} />
          <Button
            label={r.shared_with_friends ? t('recipe.unshare') : t('recipe.shareOnProfile')}
            variant={r.shared_with_friends ? 'ghost' : 'secondary'}
            onPress={() => setShared.mutate(!r.shared_with_friends)}
            loading={setShared.isPending}
          />
          {r.sources?.url ? (
            <Button label={t('recipe.openSource')} variant="ghost" onPress={() => openExternalUrl(r.sources!.url)} />
          ) : null}
        </View>

        <InsightsCard recipe={r} nutrition={mine.nutrition} personalized={mine.changed} />

        <Section title={t('recipe.ingredients')}>
          {base ? (
            <View style={styles.people}>
              <AppText variant="caption" tone="secondary">
                {t('recipe.people')}
              </AppText>
              <View style={styles.chips}>
                {choices.map((n) => (
                  <Chip
                    key={n}
                    label={n === base ? `${n} · ${t('recipe.original')}` : String(n)}
                    selected={people === n}
                    onPress={() => setPeople(n)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {missing ? (
            <Notice title={base ? t('recipe.estimateDoses') : t('recipe.noServings')}>
              <Button
                label={estimate.isPending ? t('recipe.estimating') : t('recipe.estimateDoses')}
                variant="secondary"
                onPress={runEstimate}
                loading={estimate.isPending}
              />
            </Notice>
          ) : null}
          {doseMessage ? <AppText tone="secondary">{doseMessage}</AppText> : null}
          <InlineError message={estimate.isError ? errorMessage(estimate.error, t) : null} />

          {r.recipe_ingredients.length ? (
            mine.ingredients.map((i) => (
              <View key={i.id} style={styles.ingredient}>
                <View style={[styles.dot, { backgroundColor: i.estimated ? colors.textSecondary : colors.primary }]} />
                <AppText style={styles.flex}>
                  {formatIngredient({ ...i, quantity: scaleQuantity(i.quantity, i.unit, factor) })}
                  {i.personalized ? ' ⚙️' : ''}
                </AppText>
              </View>
            ))
          ) : (
            <AppText tone="secondary">{t('recipe.noIngredients')}</AppText>
          )}
          {mine.changed ? (
            <AppText variant="caption" tone="secondary">
              {t('portions.legend')}
            </AppText>
          ) : null}
          {anyEstimated || r.servings_estimated ? (
            <AppText variant="caption" tone="secondary">
              {[anyEstimated ? t('recipe.estimatedLegend') : null, r.servings_estimated ? t('recipe.servingsEstimated') : null]
                .filter(Boolean)
                .join(' ')}
            </AppText>
          ) : null}
        </Section>

        {/* un solo riquadro: resta lo stesso (col suo messaggio) anche quando arrivano i passaggi */}
        <VideoCard recipeId={r.id} hasSteps={r.recipe_steps.length > 0} />

        <Section title={t('recipe.steps')}>
          {r.recipe_steps.length ? (
            r.recipe_steps.map((s, index) => (
              <View key={s.id} style={styles.step}>
                <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
                  <AppText variant="bodyStrong" tone="onPrimary">
                    {index + 1}
                  </AppText>
                </View>
                <View style={styles.flex}>
                  <AppText>{s.text}</AppText>
                  {s.timer_seconds ? (
                    <AppText variant="caption" tone="primary">
                      ⏱ {t('recipe.timer', { time: formatMinutes(Math.round(s.timer_seconds / 60)) ?? `${s.timer_seconds} s` })}
                    </AppText>
                  ) : null}
                </View>
              </View>
            ))
          ) : (
            <AppText tone="secondary">{t('recipe.noSteps')}</AppText>
          )}
        </Section>

        <RatingCard
          kind="recipe"
          id={r.id}
          status={r.status}
          rating={r.rating}
          notes={r.notes}
          doneAt={r.last_cooked_at}
        />

        {/* le tue ricette condivise: mi piace e commenti di chi le vede */}
        {r.shared_with_friends ? <RecipeSocial recipeId={r.id} /> : null}

        <Section title={t('recipe.variants')}>
          <AppText tone="secondary">{t('recipe.variantsHint')}</AppText>
          <View style={styles.chips}>
            {VARIANT_KINDS.map((kind) => (
              <Chip
                key={kind}
                label={t(`recipe.variantKind.${kind}`)}
                onPress={() => router.push({ pathname: '/recipe/[id]/variant', params: { id: r.id, kind } })}
              />
            ))}
          </View>
        </Section>

        <DeleteRecipe recipe={r} />
      </View>
    </Screen>
  );
}

/** 🗑️ Elimina la ricetta (con conferma): poi si torna alla Libreria. */
function DeleteRecipe({ recipe: r }: { recipe: RecipeWithDetails }) {
  const { t } = useTranslation();
  const remove = useDeleteRecipe(r.id);
  const ask = async () => {
    const message = r.shared_with_friends ? t('recipe.deleteConfirmShared', { title: r.title }) : t('recipe.deleteConfirm', { title: r.title });
    if (await confirm(message, { ok: t('common.delete'), cancel: t('common.cancel') })) {
      remove.mutate(r.image_url, { onSuccess: () => router.replace('/library') });
    }
  };
  return (
    <View style={styles.delete}>
      <Pressable onPress={ask} disabled={remove.isPending} accessibilityRole="button" hitSlop={8}>
        <AppText variant="bodyStrong" tone="danger">
          {remove.isPending ? t('recipe.deleting') : t('recipe.delete')}
        </AppText>
      </Pressable>
      <InlineError message={remove.isError ? errorMessage(remove.error, t) : null} />
    </View>
  );
}

/** Calorie e valori per porzione, difficoltà e costo (stime). */
function InsightsCard({
  recipe: r,
  nutrition: n,
  personalized,
}: {
  recipe: RecipeWithDetails;
  nutrition: Nutrition;
  personalized: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const compute = useRecipeInsights(r.id);
  const [message, setMessage] = useState<string | null>(null);
  const logRecipe = useLogRecipe();
  const [logged, setLogged] = useState(false);
  const eatOne = () =>
    logRecipe.mutate(
      { recipeId: r.id, date: toISODate(new Date()), slot: mealTimeFor(new Date().getHours()) },
      { onSuccess: () => setLogged(true) },
    );
  const hasInsights = r.kcal_per_serving !== null || r.difficulty !== null || r.cost_level !== null;

  function run() {
    setMessage(null);
    compute.mutate(undefined, {
      onSuccess: (res: InsightsResult) =>
        setMessage(res.status === 'done' ? null : res.status === 'skipped' ? t(`recipe.aiSkipped.${res.reason}`) : res.reason === 'rate_limited' ? t('recipe.aiRateLimited') : t('recipe.aiError')),
    });
  }

  const grams = (v: number | null) => (v === null ? '—' : `${Math.round(Number(v))} g`);
  return (
    <View style={[styles.insights, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.insightsHeader}>
        <AppText variant="bodyStrong">{t('recipe.perServing')}</AppText>
        {hasInsights ? (
          <Pressable onPress={run} disabled={compute.isPending} accessibilityRole="button">
            <AppText variant="caption" tone="primary">
              {compute.isPending ? t('recipe.computingInsights') : t('recipe.recomputeInsights')}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {hasInsights ? (
        <>
          <View style={styles.stats}>
            <Stat label="kcal" value={n.kcal !== null ? String(n.kcal) : '—'} big />
            <Stat label={t('recipe.protein')} value={grams(n.protein)} />
            <Stat label={t('recipe.carbs')} value={grams(n.carbs)} />
            <Stat label={t('recipe.fat')} value={grams(n.fat)} />
          </View>
          <View style={styles.stats}>
            <Stat label={t('recipe.difficulty')} value={r.difficulty ? t(`recipe.difficultyLevel.${r.difficulty}`) : '—'} />
            <Stat label={t('recipe.cost')} value={r.cost_level ? '€'.repeat(r.cost_level) : '—'} />
          </View>
          <AppText variant="caption" tone="secondary">
            {personalized ? `${t('recipe.insightsNote')} ${t('portions.insightsNote')}` : t('recipe.insightsNote')}
          </AppText>
          {n.kcal !== null ? (
            logged ? (
              <AppText tone="secondary">{t('diary.logged')}</AppText>
            ) : (
              <Button label={t('diary.logRecipe')} variant="secondary" onPress={eatOne} loading={logRecipe.isPending} />
            )
          ) : null}
          <InlineError message={logRecipe.isError ? errorMessage(logRecipe.error, t) : null} />
        </>
      ) : (
        <>
          <AppText tone="secondary">{t('recipe.insightsMissing')}</AppText>
          <Button
            label={compute.isPending ? t('recipe.computingInsights') : t('recipe.computeInsights')}
            variant="secondary"
            onPress={run}
            loading={compute.isPending}
          />
        </>
      )}
      {message ? <AppText tone="secondary">{message}</AppText> : null}
      <InlineError message={compute.isError ? errorMessage(compute.error, t) : null} />
    </View>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={styles.stat}>
      <AppText variant={big ? 'heading' : 'bodyStrong'}>{value}</AppText>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  delete: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md },
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  image: { width: '100%', aspectRatio: 4 / 3, maxHeight: 420, borderRadius: radius.lg, overflow: 'hidden' },
  titleBlock: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  people: { gap: spacing.sm },
  insights: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  insightsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, minWidth: 0 },
  buttons: { gap: spacing.sm },
  ingredient: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepNumber: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: spacing.xs },
});
