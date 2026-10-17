import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { MIN_AGE } from '@/features/legal/content';
import { spacing, useTheme } from '@/theme';

/** Spunta "Ho almeno 14 anni e accetto Termini e Privacy" (con i link alle due pagine). */
export function ConsentCheck({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onChange(!checked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={t('legal.consent', { age: MIN_AGE })}
        hitSlop={8}
        style={[styles.box, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : 'transparent' }]}>
        {checked ? (
          <AppText variant="caption" tone="onPrimary">
            ✓
          </AppText>
        ) : null}
      </Pressable>
      <AppText style={styles.flex} onPress={() => onChange(!checked)}>
        {t('legal.consentStart', { age: MIN_AGE })}
        <AppText tone="primary" style={styles.link} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}>
          {t('legal.terms')}
        </AppText>
        {t('legal.consentAnd')}
        <AppText tone="primary" style={styles.link} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}>
          {t('legal.privacy')}
        </AppText>
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  flex: { flex: 1 },
  link: { textDecorationLine: 'underline', fontWeight: '600' },
});
