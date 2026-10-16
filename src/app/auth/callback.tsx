// Qui arriva il link di conferma email (o il ritorno dal login Google su alcuni Android).
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { parseAuthCallback } from '@/features/auth/callbackUrl';
import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ code?: string }>();
  const url = Linking.useLinkingURL();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const parsed = params.code ? { kind: 'code' as const, code: params.code } : parseAuthCallback(url ?? '');
      if (parsed.kind === 'error') {
        setError(parsed.message);
        return;
      }
      if (parsed.kind === 'code') {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(parsed.code);
        // Se la sessione esiste già (es. login Google già completato) l'errore si può ignorare.
        const { data } = await supabase.auth.getSession();
        if (exchangeError && !data.session) {
          if (!cancelled) setError(errorMessage(exchangeError, t));
          return;
        }
      }
      if (!cancelled) router.replace('/');
    }
    run().catch((e) => !cancelled && setError(errorMessage(e, t)));
    return () => {
      cancelled = true;
    };
  }, [params.code, url, t]);

  return (
    <Screen>
      {error ? (
        <>
          <ErrorState message={error} />
          <Button label={t('auth.goToSignIn')} variant="ghost" onPress={() => router.replace('/sign-in')} />
        </>
      ) : (
        <LoadingState message={t('auth.callbackLoading')} />
      )}
    </Screen>
  );
}
