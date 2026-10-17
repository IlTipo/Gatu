import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { EmptyState, InlineError, LoadingState } from '@/components/StateViews';
import { useAuth } from '@/features/auth/AuthProvider';
import { savePendingInvite } from '@/features/social/invite';
import { type FriendRequestResult, useSendFriendRequest } from '@/features/social/api';
import { useInvitePreview } from '@/features/social/network';
import { errorMessage } from '@/lib/errors';
import { spacing } from '@/theme';

/**
 * Link d'invito di un amico (…/invite/ABCD1234): mostra chi ti invita e manda la richiesta
 * solo se premi il pulsante (aprire un link non basta a diventare amici).
 */
export default function InviteScreen() {
  const { t } = useTranslation();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session } = useAuth();
  const preview = useInvitePreview(code, !!session);
  const send = useSendFriendRequest();
  const [result, setResult] = useState<FriendRequestResult | null>(null);

  // non ancora dentro: il codice si ricorda e si torna qui dopo l'accesso
  if (!session) {
    if (code) savePendingInvite(code);
    return <Redirect href="/" />;
  }

  const person = preview.data;
  let body;
  if (preview.isPending) body = <LoadingState />;
  else if (preview.isError) body = <InlineError message={errorMessage(preview.error, t)} />;
  else if (!person) body = <EmptyState title={t('friends.result.not_found')} />;
  else
    body = (
      <View style={styles.person}>
        <Avatar url={person.avatar_url} name={person.display_name ?? person.username} size={88} zoomable />
        <AppText variant="heading">@{person.username}</AppText>
        {person.display_name ? <AppText tone="secondary">{person.display_name}</AppText> : null}
        {result ? (
          <AppText>{t(`friends.result.${result}`)}</AppText>
        ) : person.is_friend ? (
          <AppText>{t('friends.result.already')}</AppText>
        ) : (
          <>
            <AppText tone="secondary" style={styles.center}>
              {t('friends.inviteHint')}
            </AppText>
            <Button label={t('friends.sendRequest')} onPress={() => send.mutate(code, { onSuccess: setResult })} loading={send.isPending} />
          </>
        )}
        <InlineError message={send.isError ? errorMessage(send.error, t) : null} />
      </View>
    );

  return (
    <Screen>
      <View style={styles.container}>
        <AppText variant="title">👥 {t('friends.inviteTitle')}</AppText>
        {body}
        <Button label={t('friends.goToFriends')} variant="ghost" onPress={() => router.replace('/friends')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  person: { alignItems: 'center', gap: spacing.md },
  center: { textAlign: 'center' },
});
