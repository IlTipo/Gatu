import { router, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatCountdown } from '@/features/cooking/logic';
import { stopRinging, useNow, useTimers } from '@/features/cooking/timers';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';

/**
 * Fuori dalla modalità cucina: un piccolo avviso con il timer più vicino.
 * Toccandolo torni a cucinare (o fermi il timer che suona).
 */
export function TimersPill() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // sopra la barra delle schede (alta 68 + spazio in basso)
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const timers = useTimers();
  const now = useNow(timers.length > 0);
  if (!timers.length || pathname.endsWith('/cook')) return null;

  const ringing = timers.some((x) => x.ringing || x.endAt <= now);
  const next = [...timers].sort((a, b) => a.endAt - b.endAt)[0];
  const onPress = () =>
    ringing ? stopRinging() : router.push({ pathname: '/recipe/[id]/cook', params: { id: next.recipeId } });

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.pill,
        { shadowColor: colors.shadow },
        { bottom: Math.max(insets.bottom, 8) + 76, backgroundColor: ringing ? colors.danger : colors.text, opacity: pressed ? 0.85 : 1 },
      ]}>
      <AppText variant="bodyStrong" style={{ color: ringing ? colors.onPrimary : colors.background }}>
        {ringing ? t('cook.ringingPill') : t('cook.timersPill', { count: timers.length, time: formatCountdown(next.endAt - now) })}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
