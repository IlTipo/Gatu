import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { ErrorState, InlineError, LoadingState } from '@/components/StateViews';
import { formatIngredient, formatMinutes } from '@/features/recipes/format';
import { useCopyFriendRecipe, useFriendRecipe } from '@/features/social/api';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

/** Ricetta di un amico: si guarda e si può salvare nella propria libreria. */
export default function FriendRecipeScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipe = useFriendRecipe(id);
  const copy = useCopyFriendRecipe();

  if (recipe.isPending) return <Screen><LoadingState /></Screen>;
  if (recipe.isError) {
    return (
      <Screen>
        <BackButton />
        <ErrorState message={t('friends.notAvailable')} onRetry={() => recipe.refetch()} />
      </Screen>
    );
  }
  const r = recipe.data;
  const facts = [
    r.servings ? t('recipe.servings', { count: r.servings }) : null,
    r.total_minutes ? `⏱ ${formatMinutes(r.total_minutes)}` : null,
    r.kcal_per_serving ? `${r.kcal_per_serving} kcal` : null,
  ].filter(Boolean);
  const save = () =>
    copy.mutate(r, { onSuccess: (newId) => router.replace({ pathname: '/recipe/[id]', params: { id: newId } }) });

  return (
    <Screen scroll>
      <View style={styles.container}>
        <BackButton />
        {r.image_url ? (
          <View style={[styles.image, { backgroundColor: colors.surfaceMuted }]}>
            <Image source={{ uri: r.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
          </View>
        ) : null}
        <AppText variant="title">{r.title}</AppText>
        {r.author ? (
          <AppText tone="secondary">
            {r.homemade ? t('friendsRecipes.byHomemade', { name: r.author }) : t('friendsRecipes.by', { name: r.author })}
          </AppText>
        ) : null}
        {facts.length ? <AppText tone="secondary">{facts.join(' · ')}</AppText> : null}
        {r.description ? <AppText>{r.description}</AppText> : null}
        <Button label={t('friends.saveRecipe')} onPress={save} loading={copy.isPending} />
        <InlineError message={copy.isError ? errorMessage(copy.error, t) : null} />
        <Section title={t('recipe.ingredients')}>
          {r.ingredients.map((i, index) => (
            <AppText key={index}>• {formatIngredient(i)}</AppText>
          ))}
        </Section>
        <Section title={t('recipe.steps')}>
          {r.steps.map((s, index) => (
            <AppText key={index}>
              {index + 1}. {s.text}
            </AppText>
          ))}
        </Section>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  image: { width: '100%', aspectRatio: 16 / 10, borderRadius: radius.lg, overflow: 'hidden' },
});
