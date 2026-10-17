import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { useCreateRecipe, useUpdateRecipe } from '@/features/recipes/api';
import { RECIPE_TAGS } from '@/features/recipes/constants';
import { formatQuantity, parseNumber } from '@/features/recipes/format';
import type { RecipeDraft, RecipeWithDetails } from '@/features/recipes/types';
import { errorMessage } from '@/lib/errors';
import { pickRecipePhoto } from '@/lib/photo';
import { supabase } from '@/lib/supabase';
import { uploadPhoto } from '@/lib/upload';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { BackButton } from './BackButton';
import { Button } from './Button';
import { Chip } from './Chip';
import { Screen } from './Screen';
import { Section } from './Section';
import { InlineError } from './StateViews';
import { TextField } from './TextField';

// Nel modulo i numeri restano testo finché non si salva (così si può scrivere "0,5").
type IngredientRow = {
  key: string;
  quantity: string;
  unit: string;
  name: string;
  note: string;
  aisle: string;
  /** dose stimata dall'AI: torna "vera" appena la modifichi a mano */
  estimated: boolean;
};
type StepRow = { key: string; text: string; timerMinutes: string };
let nextKey = 0;
const newKey = () => `row-${nextKey++}`;

/**
 * Modulo della ricetta: modifica di una ricetta salvata oppure, senza `recipe`,
 * una ricetta NUOVA scritta da te (con foto e "fai vedere ai miei amici").
 */
export function RecipeForm({ recipe }: { recipe?: RecipeWithDetails }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const isNew = !recipe;
  const update = useUpdateRecipe(recipe?.id ?? '');
  const create = useCreateRecipe();
  const [title, setTitle] = useState(recipe?.title ?? '');
  const [description, setDescription] = useState(recipe?.description ?? '');
  const [servings, setServings] = useState(recipe?.servings?.toString() ?? (isNew ? '2' : ''));
  const [prep, setPrep] = useState(recipe?.prep_minutes?.toString() ?? '');
  const [cook, setCook] = useState(recipe?.cook_minutes?.toString() ?? '');
  const [tags, setTags] = useState<string[]>(recipe?.tags ?? []);
  const [imageUrl] = useState<string | null>(recipe?.image_url ?? null);
  const [photo, setPhoto] = useState<{ uri: string; base64: string } | null>(null);
  // le ricette nuove scritte da te sono visibili agli amici, se non scegli diversamente
  const [shared, setShared] = useState(recipe?.shared_with_friends ?? true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  // una ricetta nuova parte con un ingrediente e un passaggio vuoti
  const [ingredients, setIngredients] = useState<IngredientRow[]>(() =>
    !recipe
      ? [{ key: newKey(), quantity: '', unit: 'g', name: '', note: '', aisle: 'altro', estimated: false }]
      : recipe.recipe_ingredients.map((i) => ({
      key: newKey(),
      quantity: formatQuantity(i.quantity),
      unit: i.unit ?? '',
      name: i.name,
      note: i.note ?? '',
      aisle: i.aisle,
      estimated: i.estimated,
    })),
  );
  const [steps, setSteps] = useState<StepRow[]>(() =>
    !recipe
      ? [{ key: newKey(), text: '', timerMinutes: '' }]
      : recipe.recipe_steps.map((s) => ({
      key: newKey(),
      text: s.text,
      timerMinutes: s.timer_seconds ? formatQuantity(s.timer_seconds / 60) : '',
    })),
  );
  const [titleError, setTitleError] = useState<string | null>(null);

  const choosePhoto = async () => {
    const picked = await pickRecipePhoto(1200).catch(() => null);
    if (picked) setPhoto({ uri: picked.uri, base64: picked.base64 });
  };

  const toggleTag = (tag: string) => setTags((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]));
  // se cambi quantità o unità a mano, la dose non è più "stimata"
  const setIngredient = (key: string, patch: Partial<IngredientRow>) =>
    setIngredients((rows) =>
      rows.map((r) =>
        r.key === key ? { ...r, ...patch, estimated: 'quantity' in patch || 'unit' in patch ? false : r.estimated } : r
      )
    );
  const setStep = (key: string, patch: Partial<StepRow>) => setSteps((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function save() {
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
      // porzioni stimate solo se non le hai cambiate
      servings_estimated: !!recipe?.servings_estimated && int(servings) === recipe?.servings,
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
          estimated: i.estimated && parseNumber(i.quantity) !== null,
        })),
      steps: steps
        .filter((s) => s.text.trim())
        .map((s) => {
          const minutes = parseNumber(s.timerMinutes);
          return { text: s.text.trim(), timer_seconds: minutes ? Math.round(minutes * 60) : null };
        }),
    };
    setSaving(true);
    setSaveError(null);
    try {
      const image = photo ? await uploadPhoto(photo.base64, 'recipe') : imageUrl;
      if (recipe) {
        await update.mutateAsync(draft);
        const { error } = await supabase.from('recipes').update({ image_url: image, shared_with_friends: shared }).eq('id', recipe.id);
        if (error) throw error;
        if (router.canGoBack()) router.back();
        else router.replace(`/recipe/${recipe.id}`);
      } else {
        const { servings_estimated: _s, ...rest } = draft;
        const id = await create.mutateAsync({ ...rest, image_url: image });
        const { error } = await supabase.from('recipes').update({ homemade: true, shared_with_friends: shared }).eq('id', id);
        if (error) throw error;
        router.replace({ pathname: '/recipe/[id]', params: { id } });
      }
    } catch (e) {
      setSaveError(e);
    } finally {
      setSaving(false);
    }
  }
  const shownImage = photo?.uri ?? imageUrl;

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.container}>
        <BackButton fallback={recipe ? `/recipe/${recipe.id}` : '/library'} />
        <AppText variant="title">{isNew ? t('recipe.newTitle') : t('recipe.editTitle')}</AppText>

        <Pressable
          onPress={choosePhoto}
          accessibilityRole="button"
          accessibilityLabel={t('recipe.photoLabel')}
          style={[styles.photo, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          {shownImage ? (
            <Image source={{ uri: shownImage }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <AppText tone="secondary">📷 {t('recipe.addPhoto')}</AppText>
          )}
        </Pressable>
        {shownImage ? (
          <Pressable onPress={choosePhoto} accessibilityRole="button" style={styles.changePhoto}>
            <AppText variant="caption" tone="primary">
              {t('recipe.changePhoto')}
            </AppText>
          </Pressable>
        ) : null}

        <TextField
          label={t('recipe.title')}
          value={title}
          onChangeText={setTitle}
          error={titleError}
          placeholder={isNew ? t('recipe.newTitlePlaceholder') : undefined}
          maxLength={300}
        />
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
                  <TextField
                    label={t('recipe.qty')}
                    value={i.quantity}
                    onChangeText={(v) => setIngredient(i.key, { quantity: v })}
                    keyboardType="decimal-pad"
                    hint={i.estimated ? `~ ${t('recipe.estimatedShort')}` : undefined}
                  />
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
            onPress={() => setIngredients((rows) => [...rows, { key: newKey(), quantity: '', unit: '', name: '', note: '', aisle: 'altro', estimated: false }])}
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

        <View style={[styles.card, styles.shareRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{t('recipe.shareWithFriends')}</AppText>
            <AppText variant="caption" tone="secondary">
              {t('recipe.shareWithFriendsHint')}
            </AppText>
          </View>
          <Switch
            value={shared}
            onValueChange={setShared}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={colors.surface}
            accessibilityLabel={t('recipe.shareWithFriends')}
          />
        </View>

        <InlineError message={saveError ? errorMessage(saveError, t) : null} />
        <Button label={saving ? t('common.saving') : isNew ? t('recipe.saveNew') : t('common.save')} onPress={save} loading={saving} />
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
  photo: { width: '100%', aspectRatio: 16 / 10, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  changePhoto: { alignSelf: 'center', marginTop: -spacing.sm },
  shareRow: { flexDirection: 'row', alignItems: 'center' },
});
