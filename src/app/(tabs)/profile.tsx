import Constants from 'expo-constants';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { InlineError } from '@/components/StateViews';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { radius, spacing, useTheme } from '@/theme';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { session } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setSigningOut(true);
    setError(null);
    const { error: e } = await supabase.auth.signOut();
    if (e) {
      setError(errorMessage(e, t));
      setSigningOut(false);
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <AppText variant="title">{t('profile.title')}</AppText>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="caption" tone="secondary">
            {t('profile.signedInAs')}
          </AppText>
          <AppText variant="bodyStrong">{session?.user.email ?? '—'}</AppText>
        </View>
        <InlineError message={error} />
        <Button label={t('profile.signOut')} variant="secondary" onPress={signOut} loading={signingOut} />
        <AppText variant="caption" tone="secondary" style={styles.version}>
          {t('profile.version', { version: Constants.expoConfig?.version ?? '?' })}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  card: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs },
  version: { textAlign: 'center' },
});
