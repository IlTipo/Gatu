import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { formatCountdown } from '@/features/cooking/logic';
import { addMinute, cancelTimer, stopRinging, useNow, useTimers } from '@/features/cooking/timers';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';

/** I timer in corso, sempre in vista in cima alla modalità cucina. */
export function TimersBar() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const timers = useTimers();
  const now = useNow(timers.length > 0);
  if (!timers.length) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bar} contentContainerStyle={styles.row}>
      {timers.map((timer) => {
        const left = timer.endAt - now;
        const ringing = timer.ringing || left <= 0;
        return (
          <View
            key={timer.id}
            accessibilityRole="timer"
            accessibilityLabel={`${timer.label}: ${ringing ? t('cook.timerDone') : formatCountdown(left)}`}
            style={[
              styles.timer,
              ringing
                ? { backgroundColor: colors.danger, borderColor: colors.danger }
                : { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
            <AppText variant="caption" numberOfLines={1} style={ringing ? { color: colors.onPrimary } : undefined}>
              {timer.label}
            </AppText>
            <AppText variant="heading" style={ringing ? { color: colors.onPrimary } : undefined}>
              {ringing ? t('cook.timerDone') : formatCountdown(left)}
            </AppText>
            <View style={styles.actions}>
              {ringing ? (
                <Small label={t('cook.stop')} onPress={stopRinging} light />
              ) : (
                <Small label="✕" accessibilityLabel={t('cook.cancel')} onPress={() => cancelTimer(timer.id)} />
              )}
              <Small label={t('cook.plusMinute')} onPress={() => addMinute(timer.id)} light={ringing} />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function Small({
  label,
  onPress,
  light,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  light?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.small,
        { borderColor: light ? colors.onPrimary : colors.border, opacity: pressed ? 0.6 : 1 },
      ]}>
      <AppText variant="caption" style={{ fontWeight: '700', color: light ? colors.onPrimary : colors.text }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // senza flexGrow: 0 la riga orizzontale si allungherebbe in altezza
  bar: { flexGrow: 0, flexShrink: 0 },
  row: { gap: spacing.sm, paddingBottom: spacing.xs, alignItems: 'flex-start' },
  timer: { minWidth: 150, maxWidth: 200, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, gap: 2 },
  actions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  small: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1 },
});
