import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAddFood, useEstimateFood } from '@/features/diary/api';
import { useEstimatePlanKcal } from '@/features/diet/api';
import { type DietOption, type DietPlan, type DietSlot, dayIndexFor, diarySlot, optionIngredients, SLOT_EMOJI } from '@/features/diet/types';
import { toISODate } from '@/features/planner/dates';
import { useLibraryRecipes } from '@/features/library/api';
import { matchPantry } from '@/features/library/pantry';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { Chip } from './Chip';
import { PressableScale } from './Motion';

/** Il piano alimentare: giorni, pasti e alternative. Con "preview" si mostra solo (prima di salvarlo). */
export function DietPlanView({ plan, preview = false }: { plan: DietPlan; preview?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const todayIndex = dayIndexFor(plan, new Date());
  const [day, setDay] = useState(todayIndex);
  const current = plan.days[Math.min(day, plan.days.length - 1)];

  return (
    <View style={styles.wrap}>
      {plan.days.length > 1 ? (
        <View style={styles.chips}>
          {plan.days.map((d, i) => (
            <Chip key={`${d.label}-${i}`} label={i === todayIndex && !preview ? `${d.label} · ${t('diet.today')}` : d.label} selected={i === day} onPress={() => setDay(i)} />
          ))}
        </View>
      ) : null}
      {!preview ? <KcalBanner plan={plan} /> : null}
      {current?.meals.map((meal, mi) => (
        <View key={`${meal.slot}-${mi}`} style={[styles.meal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="heading">
            {SLOT_EMOJI[meal.slot]} {t(`diet.slots.${meal.slot}`)}
          </AppText>
          {meal.options.map((option, oi) => (
            <View key={oi} style={styles.option}>
              {oi > 0 ? (
                <AppText variant="caption" tone="secondary" style={styles.or}>
                  {t('diet.or')}
                </AppText>
              ) : null}
              <AppText>
                {option.text}
                {option.kcal ? (
                  <AppText variant="caption" tone="secondary">
                    {'  '}🔥 ~{option.kcal} kcal
                  </AppText>
                ) : null}
              </AppText>
              {preview ? null : <OptionActions option={option} slot={meal.slot} />}
            </View>
          ))}
        </View>
      ))}
      {plan.notes.length ? (
        <View style={[styles.meal, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          <AppText variant="bodyStrong">📝 {t('diet.notes')}</AppText>
          {plan.notes.map((n, i) => (
            <AppText key={i} tone="secondary">
              • {n}
            </AppText>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Se mancano le calorie di qualche pasto: un tocco e l'AI le stima tutte. */
function KcalBanner({ plan }: { plan: DietPlan }) {
  const { t } = useTranslation();
  const estimate = useEstimatePlanKcal();
  const [message, setMessage] = useState<string | null>(null);
  const missing = plan.days.some((d) => d.meals.some((m) => m.options.some((o) => o.kcal == null)));
  if (!missing) return null;
  return (
    <View style={styles.option}>
      <Button
        label={estimate.isPending ? t('diet.kcalCalculating') : t('diet.kcalCalculate')}
        variant="secondary"
        loading={estimate.isPending}
        onPress={() =>
          estimate.mutate(plan, {
            onSuccess: (res) => {
              if (res.status === 'skipped') setMessage(t(`recipe.aiSkipped.${res.reason as 'not_configured' | 'quota_exceeded'}`));
              else if (res.status === 'error')
                setMessage(res.reason === 'rate_limited' ? t('recipe.aiRateLimited') : res.reason === 'overloaded' ? t('recipe.aiBusy') : t('recipe.aiError'));
            },
            onError: (e) => setMessage(errorMessage(e, t)),
          })
        }
      />
      {message ? <AppText variant="caption" tone="secondary">{message}</AppText> : null}
    </View>
  );
}

/** "L'ho mangiato" (nel diario, con calorie stimate) e "Ricette adatte". */
function OptionActions({ option, slot }: { option: DietOption; slot: DietSlot }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const estimate = useEstimateFood();
  const add = useAddFood();
  const recipes = useLibraryRecipes();
  const [message, setMessage] = useState<string | null>(null);
  const [showRecipes, setShowRecipes] = useState(false);
  const ingredients = useMemo(() => optionIngredients(option), [option]);
  const matches = useMemo(
    () => (showRecipes ? matchPantry(recipes.data ?? [], ingredients).filter((m) => m.have.length >= Math.min(2, ingredients.length)).slice(0, 5) : []),
    [showRecipes, recipes.data, ingredients],
  );

  const eaten = async () => {
    setMessage(null);
    try {
      const res = await estimate.mutateAsync({ text: option.text });
      if (res.status !== 'done') {
        setMessage(res.status === 'skipped' ? t(`recipe.aiSkipped.${res.reason}`) : t('diet.logFailed'));
        return;
      }
      const f = res.food;
      await add.mutateAsync({
        eaten_on: toISODate(new Date()),
        slot: diarySlot(slot),
        name: option.text.slice(0, 200),
        kcal: Math.round(f.kcal),
        protein_g: f.protein_g,
        carbs_g: f.carbs_g,
        fat_g: f.fat_g,
        source: 'ai',
      });
      setMessage(t('diet.logged', { kcal: Math.round(f.kcal) }));
    } catch (e) {
      setMessage(errorMessage(e, t));
    }
  };

  return (
    <View style={styles.actions}>
      <View style={styles.chips}>
        <Chip label={estimate.isPending || add.isPending ? t('diet.logging') : t('diet.eaten')} onPress={eaten} />
        <Chip label={t('diet.recipes')} selected={showRecipes} onPress={() => setShowRecipes((v) => !v)} />
      </View>
      {message ? <AppText variant="caption" tone="secondary">{message}</AppText> : null}
      {showRecipes ? (
        <View style={[styles.recipes, { borderColor: colors.border }]}>
          {matches.length ? (
            matches.map((m) => (
              <PressableScale
                key={m.recipe.id}
                onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: m.recipe.id } })}
                accessibilityRole="button"
                style={styles.recipeRow}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {m.recipe.title}
                </AppText>
                <AppText variant="caption" tone="secondary" numberOfLines={1}>
                  {t('diet.uses', { list: m.have.join(', ') })}
                </AppText>
              </PressableScale>
            ))
          ) : (
            <AppText variant="caption" tone="secondary">
              {t('diet.noRecipes')}
            </AppText>
          )}
          <Button
            label={t('diet.invent')}
            variant="secondary"
            onPress={() => router.push({ pathname: '/fridge', params: { items: ingredients.join('|') } })}
            disabled={!ingredients.length}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  meal: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  option: { gap: spacing.xs },
  or: { textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.xs },
  actions: { gap: spacing.xs },
  recipes: { gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1 },
  recipeRow: { gap: 2, paddingVertical: 4 },
});
