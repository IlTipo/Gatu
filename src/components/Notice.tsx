import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';

/** Riquadro informativo (stato dell'analisi, avvisi). */
export function Notice({
  title,
  body,
  tone = 'neutral',
  icon,
  children,
}: {
  title: string;
  body?: string | null;
  tone?: 'neutral' | 'warning' | 'success';
  icon?: ReactNode;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const background = tone === 'warning' ? colors.dangerSurface : colors.surfaceMuted;
  return (
    <View style={[styles.box, { backgroundColor: background }]} accessibilityRole={tone === 'warning' ? 'alert' : undefined}>
      {icon}
      <View style={styles.flex}>
        <AppText variant="bodyStrong" style={tone === 'success' ? { color: colors.success } : undefined}>
          {title}
        </AppText>
        {body ? <AppText tone="secondary">{body}</AppText> : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, alignItems: 'flex-start' },
  flex: { flex: 1, gap: spacing.sm },
});
