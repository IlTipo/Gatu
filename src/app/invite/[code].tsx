import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { InlineError, LoadingState } from '@/components/StateViews';
import { useAuth } from '@/features/auth/AuthProvider';
import { savePendingInvite } from '@/features/social/invite';
import { type FriendRequestResult, useSendFriendRequest } from '@/features/social/api';
import { errorMessage } from '@/lib/errors';
import { spacing } from '@/theme';

/** Link d'invito di un amico (…/invite/ABCD1234): manda la richiesta di amicizia. */
export default function InviteScreen() {
  const { t } = useTranslation();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session } = useAuth();
  const send = useSendFriendRequest();
  const [result, setResult] = useState<FriendRequestResult | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!session || !code || started.current) return;
    started.current = true;
    send.mutate(code, { onSuccess: setResult });
  }, [session, code, send]);

  // non ancora dentro: il codice si ricorda e la richiesta parte dopo l'accesso
  if (!session) {
    if (code) savePendingInvite(code);
    return <Redirect href="/" />;
  }

  return (
    <Screen>
      <View style={styles.container}>
        <AppText variant="title">👥 {t('friends.title')}</AppText>
        {result ? (
          <AppText>{t(`friends.result.${result}`)}</AppText>
        ) : send.isError ? (
          <InlineError message={errorMessage(send.error, t)} />
        ) : (
          <LoadingState />
        )}
        <Button label={t('friends.goToFriends')} onPress={() => router.replace('/friends')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
});
