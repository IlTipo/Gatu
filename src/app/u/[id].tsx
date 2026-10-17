import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { FadeIn, PressableScale } from '@/components/Motion';
import { Screen } from '@/components/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/StateViews';
import { FollowButton } from '@/components/social/FollowButton';
import { useMyProfile, useSendFriendRequest } from '@/features/social/api';
import { type Person, usePerson } from '@/features/social/network';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

/** Profilo di una persona (o il mio, con id "me"): bio, numeri, pulsanti e griglia di ricette. */
export default function PersonScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const person = usePerson(id);

  return (
    <Screen scroll>
      <View style={styles.container}>
        <BackButton />
        {person.isPending ? (
          <LoadingState />
        ) : person.isError ? (
          <ErrorState message={t('social.personNotFound')} onRetry={() => person.refetch()} />
        ) : (
          <Profile person={person.data} />
        )}
      </View>
    </Screen>
  );
}

function Profile({ person: p }: { person: Person }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const me = useMyProfile();
  const friendRequest = useSendFriendRequest();
  const [friendMessage, setFriendMessage] = useState<string | null>(null);
  // griglia a 3 colonne (larghezza dello schermo, massimo 720 come le altre pagine)
  const cell = (Math.min(width, 720) - spacing.lg * 2 - spacing.xs * 2) / 3;

  return (
    <>
      <View style={styles.top}>
        <Avatar url={p.avatar_url} name={p.display_name ?? p.username} size={86} zoomable={!p.is_me} />
        <View style={styles.counts}>
          <Count value={p.recipes_count} label={t('social.recipesCount')} />
          <Count value={p.followers_count} label={t('social.followersCount')} />
          <Count value={p.following_count} label={t('social.followingCount')} />
        </View>
      </View>
      <View style={styles.names}>
        <AppText variant="heading">@{p.username}</AppText>
        {p.display_name ? <AppText variant="bodyStrong">{p.display_name}</AppText> : null}
        {p.bio ? <AppText>{p.bio}</AppText> : null}
        <AppText variant="caption" tone="secondary">
          {[p.is_public ? t('social.publicProfile') : t('social.privateProfile'), p.is_friend ? t('social.friendBadge') : null, p.follows_me ? t('social.followsYou') : null]
            .filter(Boolean)
            .join(' · ')}
        </AppText>
      </View>

      {p.is_me ? (
        <Button label={t('social.editProfile')} variant="secondary" onPress={() => router.push('/profile')} />
      ) : (
        <View style={styles.actions}>
          <FollowButton userId={p.id} following={p.following} isPublic={p.is_public} />
          {!p.is_friend ? (
            <Button
              label={t('social.addFriend')}
              variant="ghost"
              loading={friendRequest.isPending}
              onPress={() =>
                // il codice amico non serve: lo username basta (la funzione lo cerca)
                friendRequest.mutate(`@${p.username}`, { onSuccess: (r) => setFriendMessage(t(`friends.result.${r}`)) })
              }
            />
          ) : null}
        </View>
      )}
      {friendMessage ? <AppText tone="secondary">{friendMessage}</AppText> : null}
      <InlineError message={friendRequest.isError ? errorMessage(friendRequest.error, t) : null} />

      {p.can_view ? (
        p.recipes.length ? (
          <View style={styles.grid}>
            {p.recipes.map((r, i) => (
              <FadeIn key={r.id} index={i}>
                <PressableScale
                  onPress={() =>
                    router.push(p.is_me ? { pathname: '/recipe/[id]', params: { id: r.id } } : { pathname: '/friend/recipe/[id]', params: { id: r.id } })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={r.title}
                  style={[styles.cell, { width: cell, height: cell, backgroundColor: colors.surfaceMuted }]}>
                  {r.image_url ? (
                    <Image source={{ uri: r.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <View style={styles.noImage}>
                      <Icon name={{ ios: 'fork.knife', android: 'restaurant' }} size={22} color={colors.textSecondary} />
                      <AppText variant="caption" numberOfLines={2} style={styles.cellTitle}>
                        {r.title}
                      </AppText>
                    </View>
                  )}
                  {r.likes ? (
                    <View style={styles.likes}>
                      <AppText variant="caption" style={styles.likesText}>
                        ❤️ {r.likes}
                      </AppText>
                    </View>
                  ) : null}
                </PressableScale>
              </FadeIn>
            ))}
          </View>
        ) : (
          <AppText tone="secondary">{p.is_me ? t('social.noRecipesMine') : t('social.noRecipes')}</AppText>
        )
      ) : (
        <View style={[styles.locked, { borderColor: colors.border }]}>
          <AppText variant="heading">🔒</AppText>
          <AppText variant="bodyStrong">{t('social.privateTitle')}</AppText>
          <AppText tone="secondary" style={styles.center}>
            {p.following === 'pending' ? t('social.privateRequested') : t('social.privateBody')}
          </AppText>
        </View>
      )}
      {me.data && p.is_me && !me.data.is_public ? (
        <AppText variant="caption" tone="secondary">
          {t('social.youArePrivate')}
        </AppText>
      ) : null}
    </>
  );
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.count}>
      <AppText variant="heading">{value}</AppText>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, paddingBottom: spacing.xl },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  counts: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  count: { alignItems: 'center' },
  names: { gap: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  cell: { borderRadius: radius.sm, overflow: 'hidden' },
  noImage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xs, gap: 4 },
  cellTitle: { textAlign: 'center' },
  likes: { position: 'absolute', left: 4, bottom: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 6 },
  likesText: { color: '#FFFFFF' },
  locked: { alignItems: 'center', gap: spacing.xs, padding: spacing.lg, borderWidth: 1, borderRadius: radius.lg, borderStyle: 'dashed' },
  center: { textAlign: 'center' },
});
