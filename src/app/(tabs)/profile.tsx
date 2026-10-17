import Constants from 'expo-constants';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { PortionsCard } from '@/components/PortionsCard';
import { Screen } from '@/components/Screen';
import { InlineError } from '@/components/StateViews';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { radius, setThemePreference, spacing, type ThemePreference, useTheme, useThemePreference } from '@/theme';

const THEMES: ThemePreference[] = ['system', 'light', 'dark'];

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { session } = useAuth();
  const themePreference = useThemePreference();
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
    <Screen scroll>
      <View style={styles.container}>
        <AppText variant="title">{t('profile.title')}</AppText>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="caption" tone="secondary">
            {t('profile.signedInAs')}
          </AppText>
          <AppText variant="bodyStrong">{session?.user.email ?? '—'}</AppText>
        </View>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="bodyStrong">{t('profile.theme')}</AppText>
          <View style={styles.chips}>
            {THEMES.map((value) => (
              <Chip
                key={value}
                label={t(`profile.themes.${value}`)}
                selected={themePreference === value}
                onPress={() => setThemePreference(value)}
              />
            ))}
          </View>
        </View>
        <PortionsCard />
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
});
