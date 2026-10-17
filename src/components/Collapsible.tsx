import { type ReactNode, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { FadeIn, PressableScale } from './Motion';

type Props = {
  title: string;
  /** Riga sotto il titolo, visibile anche da chiuso (es. "1250 / 2200 kcal"). */
  summary?: ReactNode;
  initiallyOpen?: boolean;
  children: ReactNode;
};

/** Menu a tendina: si apre e chiude toccando il titolo. */
export function Collapsible({ title, summary, initiallyOpen = false, children }: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <PressableScale
        scaleTo={0.98}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.header}>
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{title}</AppText>
          {typeof summary === 'string' ? (
            <AppText variant="caption" tone="secondary">
              {summary}
            </AppText>
          ) : (
            summary
          )}
        </View>
        <AppText variant="heading" tone="secondary" style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          ⌄
        </AppText>
      </PressableScale>
      {open ? <FadeIn style={styles.body}>{children}</FadeIn> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  body: { gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  flex: { flex: 1, gap: 2 },
});
