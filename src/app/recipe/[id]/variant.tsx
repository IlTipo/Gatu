import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { ErrorState, InlineError, LoadingState } from '@/components/StateViews';
import { useCreateRecipe, useRecipeVariant } from '@/features/recipes/api';
import { formatIngredient, formatMinutes } from '@/features/recipes/format';
import type { RecipeVariant, VariantKind } from '@/features/recipes/types';
import { errorMessage } from '@/lib/errors';
import { spacing, useTheme } from '@/theme';

const KINDS: VariantKind[] = ['vegana', 'vegetariana', 'senza_glutine', 'senza_lattosio', 'light', 'veloce'];

/** Anteprima di una variante AI: si salva solo se la vuoi. */
export default function VariantScreen() {
  const { t } = useTranslation();
  const { id, kind: rawKind } = useLocalSearchParams<{ id: string; kind: string }>();
  const kind = (KINDS as string[]).includes(rawKind) ? (rawKind as VariantKind) : 'vegana';
  const kindLabel = t(`recipe.variantKind.${kind}`).toLowerCase();
  const variant = useRecipeVariant(id, kind);

  if (variant.isPending) {
    return (
      <Screen>
        <BackButton />
        <LoadingState message={t('recipe.variantLoading', { kind: kindLabel })} />
      </Screen>
    );
  }
  if (variant.isError) {
    return (
      <Screen>
        <BackButton />
        <ErrorState message={errorMessage(variant.error, t)} onRetry={() => variant.refetch()} />
      </Screen>
    );
  }
  const res = variant.data;
  if (res.status !== 'done') {
    return (
      <Screen>
        <BackButton />
        <ErrorState
          message={res.status === 'skipped' ? t(`recipe.aiSkipped.${res.reason}`) : res.reason === 'rate_limited' ? t('recipe.aiRateLimited') : res.reason === 'overloaded' ? t('recipe.aiBusy') : t('recipe.aiError')}
          onRetry={res.status === 'error' ? () => variant.refetch() : undefined}
        />
      </Screen>
    );
  }
  return <VariantDetails variant={res.variant} title={t('recipe.variantTitle', { kind: kindLabel })} />;
}

function VariantDetails({ variant: v, title }: { variant: RecipeVariant; title: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const create = useCreateRecipe();

  function save() {
    create.mutate(
      {
        title: v.title,
        description: v.description,
        image_url: v.image_url,
        servings: v.servings,
        prep_minutes: v.prep_minutes,
        cook_minutes: v.cook_minutes,
        total_minutes: v.total_minutes,
        tags: v.tags,
        ingredients: v.ingredients,
        steps: v.steps,
      },
      { onSuccess: (newId) => router.replace({ pathname: '/recipe/[id]', params: { id: newId } }) },
    );
  }

  const facts = [
    v.servings ? t('recipe.servings', { count: v.servings }) : null,
    v.total_minutes ? `${t('recipe.total')} ${formatMinutes(v.total_minutes)}` : null,
  ].filter(Boolean);

  return (
    <Screen scroll>
      <View style={styles.container}>
        <BackButton />
        <View style={styles.block}>
          <AppText variant="caption" tone="primary">
            {title}
          </AppText>
          <AppText variant="title">{v.title}</AppText>
          {facts.length ? <AppText variant="bodyStrong">{facts.join(' · ')}</AppText> : null}
          {v.tags.length ? (
            <View style={styles.chips}>
              {v.tags.map((tag) => <Chip key={tag} label={tag} />)}
            </View>
          ) : null}
        </View>

        {v.changes.length ? (
          <Notice title={t('recipe.variantChanges')}>
            {v.changes.map((c) => <AppText key={c}>• {c}</AppText>)}
          </Notice>
        ) : null}

        <Button label={t('recipe.saveVariant')} onPress={save} loading={create.isPending} />
        <InlineError message={create.isError ? errorMessage(create.error, t) : null} />

        <Section title={t('recipe.ingredients')}>
          {v.ingredients.map((i, n) => (
            <View key={`${n}-${i.name}`} style={styles.ingredient}>
              <View style={[styles.dot, { backgroundColor: colors.primary }]} />
              <AppText style={styles.flex}>{formatIngredient(i)}</AppText>
            </View>
          ))}
        </Section>

        <Section title={t('recipe.steps')}>
          {v.steps.map((s, n) => (
            <View key={n} style={styles.step}>
              <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
                <AppText variant="bodyStrong" tone="onPrimary">
                  {n + 1}
                </AppText>
              </View>
              <AppText style={styles.flex}>{s.text}</AppText>
            </View>
          ))}
        </Section>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  block: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  ingredient: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepNumber: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
});
