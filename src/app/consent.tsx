import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ConsentCheck } from '@/components/ConsentCheck';
import { Screen } from '@/components/Screen';
import { InlineError } from '@/components/StateViews';
import { useAcceptTerms } from '@/features/legal/api';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { spacing } from '@/theme';

/** Prima di usare Morso (o quando cambiano): accetta Termini e Privacy e conferma l'età minima. */
export default function ConsentScreen() {
  const { t } = useTranslation();
  const accept = useAcceptTerms();
  const [checked, setChecked] = useState(false);
  return (
    <Screen scroll>
      <View style={styles.container}>
        <AppText variant="title">📜 {t('legal.gateTitle')}</AppText>
        <AppText tone="secondary">{t('legal.gateBody')}</AppText>
        <ConsentCheck checked={checked} onChange={setChecked} />
        <InlineError message={accept.isError ? errorMessage(accept.error, t) : null} />
        <Button
          label={t('legal.gateContinue')}
          disabled={!checked}
          loading={accept.isPending}
          onPress={() => accept.mutate(undefined, { onSuccess: () => router.replace('/library') })}
        />
        <Button label={t('legal.gateDecline')} variant="ghost" onPress={() => supabase.auth.signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
});
