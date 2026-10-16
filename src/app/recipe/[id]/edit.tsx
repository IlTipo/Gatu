import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { ErrorState, InlineError, LoadingState } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { useRecipe, useUpdateRecipe } from '@/features/recipes/api';
import { RECIPE_TAGS } from '@/features/recipes/constants';
import { formatQuantity, parseNumber } from '@/features/recipes/format';
import type { RecipeDraft, RecipeWithDetails } from '@/features/recipes/types';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

export default function EditRecipeScreen() {
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
  return <RecipeForm recipe={recipe.data} />;
}

// Nel modulo i numeri restano testo finché non si salva (così si può scrivere "0,5").
type IngredientRow = { key: string; quantity: string; unit: string; name: string; note: string; aisle: string };
type StepRow = { key: string; text: string; timerMinutes: string };
let nextKey = 0;
const newKey = () => `row-${nextKey++}`;

function RecipeForm({ recipe }: { recipe: RecipeWithDetails }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const update = useUpdateRecipe(recipe.id);
  const [title, setTitle] = useState(recipe.title);
  const [description, setDescription] = useState(recipe.description ?? '');
  const [servings, setServings] = useState(recipe.servings?.toString() ?? '');
  const [prep, setPrep] = useState(recipe.prep_minutes?.toString() ?? '');
  const [cook, setCook] = useState(recipe.cook_minutes?.toString() ?? '');
  const [tags, setTags] = useState<string[]>(recipe.tags);
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    recipe.recipe_ingredients.map((i) => ({
      key: newKey(),
      quantity: formatQuantity(i.quantity),
      unit: i.unit ?? '',
      name: i.name,
      note: i.note ?? '',
      aisle: i.aisle,
    })),
  );
  const [steps, setSteps] = useState<StepRow[]>(
    recipe.recipe_steps.map((s) => ({
      key: newKey(),
      text: s.text,
      timerMinutes: s.timer_seconds ? formatQuantity(s.timer_seconds / 60) : '',
    })),
  );
  const [titleError, setTitleError] = useState<string | null>(null);

  const toggleTag = (tag: string) => setTags((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]));
  const setIngredient = (key: string, patch: Partial<IngredientRow>) =>
    setIngredients((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setStep = (key: string, patch: Partial<StepRow>) => setSteps((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function save() {
    if (!title.trim()) {
      setTitleError(t('recipe.titleRequired'));
      return;
    }
    setTitleError(null);
    const int = (v: string) => {
      const n = parseNumber(v);
      return n === null ? null : Math.round(n);
    };
    const prepMin = int(prep);
    const cookMin = int(cook);
    const draft: RecipeDraft = {
      title: title.trim(),
      description: description.trim() || null,
      servings: int(servings) || null,
      prep_minutes: prepMin,
      cook_minutes: cookMin,
      total_minutes: prepMin !== null || cookMin !== null ? (prepMin ?? 0) + (cookMin ?? 0) : null,
      tags,
      ingredients: ingredients
        .filter((i) => i.name.trim())
        .map((i) => ({
          quantity: parseNumber(i.quantity),
          unit: i.unit.trim() || null,
          name: i.name.trim(),
          note: i.note.trim() || null,
          aisle: i.aisle,
        })),
      steps: steps
        .filter((s) => s.text.trim())
        .map((s) => {
          const minutes = parseNumber(s.timerMinutes);
          return { text: s.text.trim(), timer_seconds: minutes ? Math.round(minutes * 60) : null };
        }),
    };
    update.mutate(draft, { onSuccess: () => (router.canGoBack() ? router.back() : router.replace(`/recipe/${recipe.id}`)) });
  }

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.container}>
        <BackButton fallback={`/recipe/${recipe.id}`} />
        <AppText variant="title">{t('recipe.editTitle')}</AppText>

        <TextField label={t('recipe.title')} value={title} onChangeText={setTitle} error={titleError} />
        <TextField label={t('recipe.description')} value={description} onChangeText={setDescription} multiline />
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField label={t('recipe.servingsLabel')} value={servings} onChangeText={setServings} keyboardType="number-pad" />
          </View>
          <View style={styles.flex}>
            <TextField label={t('recipe.prepLabel')} value={prep} onChangeText={setPrep} keyboardType="number-pad" />
          </View>
          <View style={styles.flex}>
            <TextField label={t('recipe.cookLabel')} value={cook} onChangeText={setCook} keyboardType="number-pad" />
          </View>
        </View>

        <Section title={t('recipe.tags')}>
          <View style={styles.chips}>
            {RECIPE_TAGS.map((tag) => <Chip key={tag} label={tag} selected={tags.includes(tag)} onPress={() => toggleTag(tag)} />)}
          </View>
        </Section>

        <Section title={t('recipe.ingredients')}>
          {ingredients.map((i) => (
            <View key={i.key} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={styles.row}>
                <View style={styles.qty}>
                  <TextField label={t('recipe.qty')} value={i.quantity} onChangeText={(v) => setIngredient(i.key, { quantity: v })} keyboardType="decimal-pad" />
                </View>
                <View style={styles.qty}>
                  <TextField label={t('recipe.unit')} value={i.unit} onChangeText={(v) => setIngredient(i.key, { unit: v })} autoCapitalize="none" />
                </View>
                <View style={styles.flex}>
                  <TextField label={t('recipe.ingredientName')} value={i.name} onChangeText={(v) => setIngredient(i.key, { name: v })} />
                </View>
              </View>
              <RemoveLink onPress={() => setIngredients((rows) => rows.filter((r) => r.key !== i.key))} />
            </View>
          ))}
          <Button
            label={t('recipe.addIngredient')}
            variant="secondary"
            onPress={() => setIngredients((rows) => [...rows, { key: newKey(), quantity: '', unit: '', name: '', note: '', aisle: 'altro' }])}
          />
        </Section>

        <Section title={t('recipe.steps')}>
          {steps.map((s, index) => (
            <View key={s.key} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <TextField
                label={t('recipe.stepLabel', { n: index + 1 })}
                value={s.text}
                onChangeText={(v) => setStep(s.key, { text: v })}
                multiline
              />
              <View style={styles.row}>
                <View style={styles.qty}>
                  <TextField label={t('recipe.timerLabel')} value={s.timerMinutes} onChangeText={(v) => setStep(s.key, { timerMinutes: v })} keyboardType="decimal-pad" />
                </View>
                <View style={styles.flex} />
                <RemoveLink onPress={() => setSteps((rows) => rows.filter((r) => r.key !== s.key))} />
              </View>
            </View>
          ))}
          <Button
            label={t('recipe.addStep')}
            variant="secondary"
            onPress={() => setSteps((rows) => [...rows, { key: newKey(), text: '', timerMinutes: '' }])}
          />
        </Section>

        <InlineError message={update.isError ? errorMessage(update.error, t) : null} />
        <Button label={update.isPending ? t('common.saving') : t('common.save')} onPress={save} loading={update.isPending} />
      </View>
    </Screen>
  );
}

function RemoveLink({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.remove}>
      <AppText variant="caption" tone="danger">
        {t('common.remove')}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  flex: { flex: 1 },
  qty: { width: 84 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: { gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderRadius: radius.md },
  remove: { alignSelf: 'flex-end', padding: spacing.xs },
});
