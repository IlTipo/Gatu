import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { EmptyState, LoadingState } from '@/components/StateViews';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatIngredient, formatMinutes } from '@/features/recipes/format';
import { usePublicRecipe } from '@/features/recipes/publicLink';
import { openExternalUrl } from '@/lib/openUrl';
import { radius, spacing } from '@/theme';

const PLATFORMS: Record<string, string> = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', pinterest: 'Pinterest', web: 'web' };

/** Ricetta aperta da un link condiviso (…/r/codice): si legge anche senza account. */
export default function PublicRecipeScreen() {
  const { t } = useTranslation();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session } = useAuth();
  const recipe = usePublicRecipe(token);
  const cta = (
    <View style={styles.cta}>
      <AppText tone="secondary" style={styles.center}>
        {t('publicRecipe.ctaBody')}
      </AppText>
      <Button label={session ? t('publicRecipe.openMorso') : t('publicRecipe.discover')} onPress={() => router.replace('/')} />
    </View>
  );

  if (recipe.isPending) return <Screen><LoadingState /></Screen>;
  const r = recipe.data;
  if (recipe.isError || !r) {
    return (
      <Screen scroll>
        <View style={styles.container}>
          <EmptyState title={t('publicRecipe.notFound')} body={t('publicRecipe.notFoundBody')} />
          {cta}
        </View>
      </Screen>
    );
  }

  const facts = [
    r.servings ? t('recipe.servings', { count: r.servings }) : null,
    r.total_minutes ? `⏱ ${formatMinutes(r.total_minutes)}` : null,
    r.kcal_per_serving ? `🔥 ~${Math.round(r.kcal_per_serving)} kcal` : null,
  ].filter(Boolean);

  return (
    <Screen scroll>
      <View style={styles.container}>
        <AppText variant="caption" tone="primary" style={styles.brand}>
          🍽️ MORSO
        </AppText>
        {r.image_url ? <Image source={{ uri: r.image_url }} style={styles.image} contentFit="cover" /> : null}
        <AppText variant="title">{r.title}</AppText>
        {r.description ? <AppText tone="secondary">{r.description}</AppText> : null}
        {facts.length ? <AppText variant="bodyStrong">{facts.join(' · ')}</AppText> : null}
        {r.source ? (
          <AppText variant="caption" tone="secondary" onPress={() => openExternalUrl(r.source!.url)}>
            {t('publicRecipe.source', {
              platform: PLATFORMS[r.source.platform] ?? r.source.platform,
              author: r.source.author_name ? ` · ${r.source.author_name}` : '',
            })}
          </AppText>
        ) : null}
        <Section title={t('recipe.ingredients')}>
          {r.ingredients.map((i, n) => (
            <AppText key={`${n}-${i.name}`}>• {formatIngredient(i)}</AppText>
          ))}
        </Section>
        <Section title={t('recipe.steps')}>
          {r.steps.map((s, n) => (
            <AppText key={n}>
              {n + 1}. {s.text}
            </AppText>
          ))}
        </Section>
        {cta}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.xl, paddingTop: spacing.md },
  brand: { letterSpacing: 1.5, fontWeight: '700' },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg },
  cta: { gap: spacing.sm, marginTop: spacing.lg },
  center: { textAlign: 'center' },
});
