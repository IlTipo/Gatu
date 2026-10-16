import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { useRecipe } from '@/features/recipes/api';
import { formatIngredient, formatMinutes } from '@/features/recipes/format';
import { errorMessage } from '@/lib/errors';
import { openExternalUrl } from '@/lib/openUrl';
import { radius, spacing, useTheme } from '@/theme';

export default function RecipeScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
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

  const r = recipe.data;
  const facts = [
    r.servings ? t('recipe.servings', { count: r.servings }) : null,
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
        </View>

        <View style={styles.buttons}>
          <Button
            label={t('common.edit')}
            variant="secondary"
            onPress={() => router.push({ pathname: '/recipe/[id]/edit', params: { id: r.id } })}
          />
          {r.sources?.url ? (
            <Button label={t('recipe.openSource')} variant="ghost" onPress={() => openExternalUrl(r.sources!.url)} />
          ) : null}
        </View>

        <Section title={t('recipe.ingredients')}>
          {r.recipe_ingredients.length ? (
            r.recipe_ingredients.map((i) => (
              <View key={i.id} style={styles.ingredient}>
                <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                <AppText style={styles.flex}>{formatIngredient(i)}</AppText>
              </View>
            ))
          ) : (
            <AppText tone="secondary">{t('recipe.noIngredients')}</AppText>
          )}
        </Section>

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
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  image: { width: '100%', aspectRatio: 4 / 3, maxHeight: 420, borderRadius: radius.lg, overflow: 'hidden' },
  titleBlock: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  buttons: { gap: spacing.sm },
  ingredient: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepNumber: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: spacing.xs },
});
