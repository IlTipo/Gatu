import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { FadeIn, PressableScale } from '@/components/Motion';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { formatMinutes } from '@/features/recipes/format';
import { type FriendSharedRecipe, useFriendsRecipes } from '@/features/social/api';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

/** Libreria → "👥 Ricette degli amici": quello che i tuoi amici hanno scritto e condiviso. */
export default function FriendsRecipesScreen() {
  const { t } = useTranslation();
  const list = useFriendsRecipes();

  let body;
  if (list.isPending) body = <LoadingState />;
  else if (list.isError) body = <ErrorState message={errorMessage(list.error, t)} onRetry={() => list.refetch()} />;
  else if (!list.data.length)
    body = (
      <EmptyState
        title={t('friendsRecipes.emptyTitle')}
        body={t('friendsRecipes.emptyBody')}
        action={<Button label={t('friendsRecipes.findFriends')} variant="secondary" onPress={() => router.push('/friends')} />}
      />
    );
  else body = list.data.map((r, i) => <FadeIn key={r.id} index={i}><SharedCard recipe={r} /></FadeIn>);

  return (
    <Screen scroll>
      <View style={styles.container}>
        <BackButton />
        <AppText variant="title">{t('friendsRecipes.title')}</AppText>
        <Button label={t('library.writeRecipe')} variant="secondary" onPress={() => router.push('/recipe/new')} />
        {body}
      </View>
    </Screen>
  );
}

function SharedCard({ recipe: r }: { recipe: FriendSharedRecipe }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const facts = [r.homemade ? t('friendsRecipes.homemadeShort') : null, r.total_minutes ? `⏱ ${formatMinutes(r.total_minutes)}` : null, r.kcal_per_serving ? `${r.kcal_per_serving} kcal` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/friend/recipe/[id]', params: { id: r.id } })}
      accessibilityRole="button"
      accessibilityLabel={r.title}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.image, { backgroundColor: colors.surfaceMuted }]}>
        {r.image_url ? (
          <Image source={{ uri: r.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <Icon name={{ ios: 'fork.knife', android: 'restaurant' }} size={36} color={colors.textSecondary} />
        )}
      </View>
      <View style={styles.body}>
        <View style={styles.author}>
          <Avatar url={r.author_avatar} name={r.author_name} size={24} />
          <AppText variant="caption" tone="secondary" numberOfLines={1} style={styles.flex}>
            {r.author_name ?? t('friends.someone')}
          </AppText>
        </View>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {r.title}
        </AppText>
        {facts ? (
          <AppText variant="caption" tone="secondary">
            {facts}
          </AppText>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  card: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 16 / 9, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  body: { padding: spacing.md, gap: spacing.xs },
  author: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
