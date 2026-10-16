// Le tre schermate "di stato" usate ovunque: caricamento, errore, vuoto.
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';

export function LoadingState({ message }: { message?: string }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.primary} />
      <AppText tone="secondary">{message ?? t('common.loading')}</AppText>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.center} accessibilityRole="alert">
      <View style={[styles.badge, { backgroundColor: colors.dangerSurface }]}>
        <AppText variant="heading" tone="danger">
          !
        </AppText>
      </View>
      <AppText style={styles.text}>{message}</AppText>
      {onRetry ? <Button label={t('common.retry')} variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      {icon ? <View style={[styles.badge, { backgroundColor: colors.surfaceMuted }]}>{icon}</View> : null}
      <AppText variant="heading" style={styles.text}>
        {title}
      </AppText>
      {body ? (
        <AppText tone="secondary" style={styles.text}>
          {body}
        </AppText>
      ) : null}
      {action}
    </View>
  );
}

/** Messaggio d'errore compatto, da mettere sopra un modulo. */
export function InlineError({ message }: { message: string | null }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <View accessibilityRole="alert" style={[styles.inline, { backgroundColor: colors.dangerSurface }]}>
      <AppText tone="danger">{message}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  badge: { width: 72, height: 72, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  text: { textAlign: 'center', maxWidth: 340 },
  inline: { padding: spacing.md, borderRadius: radius.md },
});
