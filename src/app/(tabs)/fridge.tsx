import { router, useLocalSearchParams } from 'expo-router';
import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { ErrorState, InlineError, LoadingState } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import {
  type FridgeRecipe,
  rememberedPantry,
  rememberPantry,
  useFridgeRecipe,
  useFridgeScan,
} from '@/features/fridge/api';
import { useLibraryRecipes } from '@/features/library/api';
import { matchPantry, splitPantryInput } from '@/features/library/pantry';
import { useCreateRecipe } from '@/features/recipes/api';
import { formatIngredient, formatMinutes } from '@/features/recipes/format';
import { errorMessage } from '@/lib/errors';
import { pickRecipePhoto } from '@/lib/photo';
import { radius, spacing, useTheme } from '@/theme';

const PEOPLE = [1, 2, 3, 4, 5, 6];
const TIMES = [15, 30, 60];

/** Messaggio per un risultato AI non riuscito. */
function aiProblem(res: { status: 'skipped' | 'error'; reason: string }, t: TFunction) {
  if (res.status === 'skipped') return t(`recipe.aiSkipped.${res.reason as 'not_configured' | 'quota_exceeded'}`);
  return res.reason === 'rate_limited' ? t('recipe.aiRateLimited') : res.reason === 'overloaded' ? t('recipe.aiBusy') : t('recipe.aiError');
}

export default function FridgeScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const recipes = useLibraryRecipes();
  const scan = useFridgeScan();
  const create = useFridgeRecipe();
  const [items, setItemsState] = useState<string[]>(rememberedPantry);
  const [draft, setDraft] = useState('');
  const [people, setPeople] = useState(2);
  const [maxMinutes, setMaxMinutes] = useState<number | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<unknown>(null);
  const [idea, setIdea] = useState<FridgeRecipe | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [ideaMessage, setIdeaMessage] = useState<string | null>(null);

  const setItems = (next: string[]) => {
    const clean = [...new Set(next)].slice(0, 40);
    rememberPantry(clean);
    setItemsState(clean);
  };

  // dal piano alimentare ("Inventa una ricetta"): arrivano gli alimenti di quel pasto
  const { items: fromPlan } = useLocalSearchParams<{ items?: string }>();
  const [handledPlan, setHandledPlan] = useState<string | undefined>(undefined);
  if (fromPlan && fromPlan !== handledPlan) {
    setHandledPlan(fromPlan);
    const next = [...new Set(fromPlan.split('|').map((s) => s.trim()).filter(Boolean))].slice(0, 40);
    rememberPantry(next);
    setItemsState(next);
    setIdea(null);
  }
  const add = () => {
    const parts = splitPantryInput(draft);
    if (!parts.length) return;
    setItems([...items, ...parts]);
    setDraft('');
  };

  async function photo() {
    setPhotoError(null);
    setScanMessage(null);
    try {
      const picked = await pickRecipePhoto();
      if (!picked) return;
      const res = await scan.mutateAsync({ base64: picked.base64, mimeType: picked.mimeType });
      if (res.status !== 'done') {
        setScanMessage(aiProblem(res, t));
        return;
      }
      setItems([...items, ...res.ingredients]);
      setScanMessage(res.ingredients.length ? t('fridge.found', { count: res.ingredients.length }) : t('fridge.foundNone'));
    } catch (e) {
      setPhotoError(e);
    }
  }

  function invent() {
    setIdeaMessage(null);
    create.mutate(
      { ingredients: items, servings: people, maxMinutes, avoid: seen },
      {
        onSuccess: (res) => {
          if (res.status !== 'done') {
            setIdeaMessage(aiProblem(res, t));
            return;
          }
          setIdea(res.recipe);
          setSeen((s) => [...s, res.recipe.title].slice(-10));
        },
      },
    );
  }

  const matches = useMemo(() => matchPantry(recipes.data ?? [], items), [recipes.data, items]);

  return (
    <Screen scroll>
      <View style={styles.container}>
        <View style={styles.block}>
          <AppText variant="title">{t('fridge.title')}</AppText>
          <AppText tone="secondary">{t('fridge.subtitle')}</AppText>
        </View>

        <View style={styles.block}>
          <Button label={scan.isPending ? t('fridge.scanning') : t('fridge.photo')} onPress={photo} loading={scan.isPending} />
          <AppText variant="caption" tone="secondary">
            {t('fridge.photoHint')}
          </AppText>
          {scanMessage ? <AppText variant="bodyStrong">{scanMessage}</AppText> : null}
          <InlineError message={photoError ? errorMessage(photoError, t) : scan.isError ? errorMessage(scan.error, t) : null} />
        </View>

        <View style={styles.inputRow}>
          <View style={styles.flex}>
            <TextField
              label={t('fridge.label')}
              value={draft}
              onChangeText={setDraft}
              placeholder={t('fridge.placeholder')}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={add}
              blurOnSubmit={false}
            />
          </View>
          <View style={styles.addButton}>
            <Button label={t('fridge.add')} variant="secondary" onPress={add} disabled={!draft.trim()} />
          </View>
        </View>
        {items.length ? (
          <View style={styles.chips}>
            {items.map((item) => (
              <Chip key={item} label={`${item}  ×`} selected onPress={() => setItems(items.filter((x) => x !== item))} />
            ))}
            <Chip label={t('fridge.clear')} onPress={() => setItems([])} />
          </View>
        ) : (
          <AppText tone="secondary">{t('fridge.empty')}</AppText>
        )}

        {items.length ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppText variant="heading">{t('fridge.createTitle')}</AppText>
            <View style={styles.block}>
              <AppText variant="caption" tone="secondary">
                {t('fridge.people')}
              </AppText>
              <View style={styles.chips}>
                {PEOPLE.map((n) => (
                  <Chip key={n} label={String(n)} selected={people === n} onPress={() => setPeople(n)} />
                ))}
              </View>
            </View>
            <View style={styles.block}>
              <AppText variant="caption" tone="secondary">
                {t('fridge.time')}
              </AppText>
              <View style={styles.chips}>
                <Chip label={t('fridge.anyTime')} selected={maxMinutes === null} onPress={() => setMaxMinutes(null)} />
                {TIMES.map((m) => (
                  <Chip key={m} label={`≤ ${m} min`} selected={maxMinutes === m} onPress={() => setMaxMinutes(m)} />
                ))}
              </View>
            </View>
            <Button
              label={create.isPending ? t('fridge.creating') : idea ? t('fridge.another') : t('fridge.create')}
              onPress={invent}
              loading={create.isPending}
              variant={idea ? 'secondary' : 'primary'}
            />
            {ideaMessage ? <AppText tone="secondary">{ideaMessage}</AppText> : null}
            <InlineError message={create.isError ? errorMessage(create.error, t) : null} />
            {idea ? <IdeaPreview key={idea.title} idea={idea} /> : null}
          </View>
        ) : null}

        {items.length ? (
          <Section title={t('fridge.fromLibrary')}>
            {recipes.isPending ? (
              <LoadingState />
            ) : recipes.isError ? (
              <ErrorState message={errorMessage(recipes.error, t)} onRetry={() => recipes.refetch()} />
            ) : matches.length ? (
              matches.slice(0, 30).map((m) => (
                <Pressable
                  key={m.recipe.id}
                  accessibilityRole="button"
                  accessibilityLabel={m.recipe.title}
                  onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: m.recipe.id } })}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: colors.surface,
                      borderColor: m.missing.length ? colors.border : colors.success,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}>
                  <AppText variant="bodyStrong">{m.recipe.title}</AppText>
                  {m.missing.length ? (
                    <AppText tone="secondary">{t('pantry.missing', { count: m.missing.length, list: m.missing.join(', ') })}</AppText>
                  ) : (
                    <AppText style={{ color: colors.success }}>{t('pantry.all')}</AppText>
                  )}
                </Pressable>
              ))
            ) : (
              <AppText tone="secondary">{t('fridge.noLibraryMatch')}</AppText>
            )}
          </Section>
        ) : null}
      </View>
    </Screen>
  );
}

/** La ricetta inventata: anteprima e "Salva nella Libreria". */
function IdeaPreview({ idea }: { idea: FridgeRecipe }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const save = useCreateRecipe();

  const saveIt = () =>
    save.mutate(
      {
        title: idea.title,
        description: idea.description,
        image_url: null,
        servings: idea.servings,
        prep_minutes: idea.prep_minutes,
        cook_minutes: idea.cook_minutes,
        total_minutes: idea.total_minutes,
        tags: idea.tags,
        ingredients: idea.ingredients,
        steps: idea.steps,
      },
      { onSuccess: (id) => router.push({ pathname: '/recipe/[id]', params: { id } }) },
    );

  const facts = [
    idea.servings ? t('recipe.servings', { count: idea.servings }) : null,
    idea.total_minutes ? `⏱ ${formatMinutes(idea.total_minutes)}` : null,
  ].filter(Boolean);

  return (
    <View style={[styles.idea, { borderTopColor: colors.border }]}>
      <AppText variant="heading">{idea.title}</AppText>
      {idea.description ? <AppText tone="secondary">{idea.description}</AppText> : null}
      {facts.length ? <AppText variant="bodyStrong">{facts.join(' · ')}</AppText> : null}
      {idea.uses.length ? <AppText variant="caption">{t('fridge.uses', { list: idea.uses.join(', ') })}</AppText> : null}
      <AppText variant="caption" style={{ color: idea.missing.length ? colors.danger : colors.success }}>
        {idea.missing.length ? t('fridge.missing', { list: idea.missing.join(', ') }) : t('fridge.nothingMissing')}
      </AppText>

      <AppText variant="bodyStrong">{t('recipe.ingredients')}</AppText>
      {idea.ingredients.map((i, n) => (
        <AppText key={`${n}-${i.name}`}>• {formatIngredient(i)}</AppText>
      ))}
      <AppText variant="bodyStrong">{t('recipe.steps')}</AppText>
      {idea.steps.map((s, n) => (
        <AppText key={n}>
          {n + 1}. {s.text}
        </AppText>
      ))}
      <Button label={save.isSuccess ? t('fridge.saved') : t('fridge.save')} onPress={saveIt} loading={save.isPending} disabled={save.isSuccess} />
      <InlineError message={save.isError ? errorMessage(save.error, t) : null} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  block: { gap: spacing.xs },
  inputRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  addButton: { marginTop: 22 },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  idea: { gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  row: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
});
