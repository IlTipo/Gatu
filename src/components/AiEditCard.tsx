import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { type FridgeRecipe, useRefineRecipe } from '@/features/fridge/api';
import { useCreateRecipe, useUpdateRecipe } from '@/features/recipes/api';
import { formatIngredient, formatMinutes } from '@/features/recipes/format';
import type { RecipeWithDetails } from '@/features/recipes/types';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { Chip } from './Chip';
import { InlineError } from './StateViews';
import { TextField } from './TextField';

const CHIPS = ['lighter', 'faster', 'veggie', 'moreProtein', 'morePeople', 'simpler'] as const;

/** Ricetta salvata → nel formato che l'AI sa riscrivere. */
function toAiRecipe(r: RecipeWithDetails): FridgeRecipe {
  return {
    title: r.title,
    description: r.description,
    servings: r.servings,
    prep_minutes: r.prep_minutes,
    cook_minutes: r.cook_minutes,
    total_minutes: r.total_minutes,
    tags: r.tags,
    uses: [],
    missing: [],
    ingredients: [...r.recipe_ingredients]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ quantity: i.quantity, unit: i.unit, name: i.name, note: i.note, aisle: i.aisle, estimated: i.estimated })),
    steps: [...r.recipe_steps].sort((a, b) => a.position - b.position).map((s) => ({ text: s.text, timer_seconds: s.timer_seconds })),
  };
}

/**
 * ✏️ Modifica con l'AI una ricetta della Libreria: chiedi cosa cambiare (anche più volte),
 * guardi l'anteprima e scegli se aggiornare questa ricetta o salvarla come nuova.
 */
export function AiEditCard({ recipe }: { recipe: RecipeWithDetails }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const refine = useRefineRecipe();
  const update = useUpdateRecipe(recipe.id);
  const create = useCreateRecipe();
  const [draft, setDraft] = useState<FridgeRecipe | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [ask, setAsk] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const askAi = (instruction: string) => {
    const text = instruction.trim();
    if (text.length < 2 || refine.isPending) return;
    setReply(null);
    setDone(null);
    const current = draft ?? toAiRecipe(recipe);
    refine.mutate(
      { recipe: current, instruction: text, history, ingredients: current.ingredients.map((i) => i.name), servings: current.servings },
      {
        onSuccess: (res) => {
          if (res.status === 'skipped') return setReply(t(`recipe.aiSkipped.${res.reason}`));
          if (res.status !== 'done')
            return setReply(res.reason === 'rate_limited' ? t('recipe.aiRateLimited') : res.reason === 'overloaded' ? t('recipe.aiBusy') : t('recipe.aiError'));
          setAsk('');
          setDraft(res.recipe);
          setHistory((h) => [...h, text].slice(-6));
          setReply(res.reply ?? t('fridge.refined'));
        },
      },
    );
  };

  const asDraft = (d: FridgeRecipe) => ({
    title: d.title,
    description: d.description,
    servings: d.servings,
    prep_minutes: d.prep_minutes,
    cook_minutes: d.cook_minutes,
    total_minutes: d.total_minutes,
    tags: d.tags,
    ingredients: d.ingredients,
    steps: d.steps,
  });
  const reset = () => {
    setDraft(null);
    setHistory([]);
    setReply(null);
  };
  const saveHere = () =>
    draft &&
    update.mutate(
      { ...asDraft(draft), servings_estimated: false },
      { onSuccess: () => (reset(), setDone(t('recipe.aiEditUpdated'))) },
    );
  const saveNew = () =>
    draft &&
    create.mutate(
      { ...asDraft(draft), image_url: recipe.image_url },
      { onSuccess: (id) => (reset(), router.push({ pathname: '/recipe/[id]', params: { id } })) },
    );

  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceMuted }]}>
      <AppText variant="heading">{t('fridge.refineTitle')}</AppText>
      <AppText variant="caption" tone="secondary">
        {history.length ? t('fridge.refineDone', { list: history.join(' · ') }) : t('recipe.aiEditHint')}
      </AppText>
      <View style={styles.chips}>
        {CHIPS.map((key) => (
          <Chip key={key} label={t(`fridge.refineChips.${key}`)} onPress={refine.isPending ? undefined : () => askAi(t(`fridge.refineChips.${key}`))} />
        ))}
      </View>
      <TextField
        label={t('fridge.refineLabel')}
        value={ask}
        onChangeText={setAsk}
        placeholder={t('fridge.refinePlaceholder')}
        returnKeyType="send"
        onSubmitEditing={() => askAi(ask)}
        maxLength={300}
      />
      <Button
        label={refine.isPending ? t('fridge.refining') : t('fridge.refine')}
        variant="secondary"
        onPress={() => askAi(ask)}
        loading={refine.isPending}
        disabled={ask.trim().length < 2}
      />
      {reply ? <AppText>🤖 {reply}</AppText> : null}
      {done ? <AppText tone="secondary">{done}</AppText> : null}
      <InlineError message={refine.isError ? errorMessage(refine.error, t) : null} />

      {draft ? (
        <View style={[styles.preview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="caption" tone="secondary" style={styles.label}>
            {t('recipe.aiEditPreview')}
          </AppText>
          <AppText variant="bodyStrong">{draft.title}</AppText>
          <AppText variant="caption" tone="secondary">
            {[draft.servings ? t('recipe.servings', { count: draft.servings }) : null, draft.total_minutes ? `⏱ ${formatMinutes(draft.total_minutes)}` : null]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
          {draft.ingredients.map((i, n) => (
            <AppText key={`${n}-${i.name}`}>• {formatIngredient(i)}</AppText>
          ))}
          {draft.steps.map((s, n) => (
            <AppText key={n}>
              {n + 1}. {s.text}
            </AppText>
          ))}
          <Button label={t('recipe.aiEditSaveHere')} onPress={saveHere} loading={update.isPending} />
          <Button label={t('recipe.aiEditSaveNew')} variant="secondary" onPress={saveNew} loading={create.isPending} />
          <Button label={t('recipe.aiEditDiscard')} variant="ghost" onPress={reset} />
          <InlineError message={update.isError ? errorMessage(update.error, t) : create.isError ? errorMessage(create.error, t) : null} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  preview: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  label: { textTransform: 'uppercase', letterSpacing: 0.6 },
});
