import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useProfileSettings, useUpdateProfileSettings } from '@/features/portions/api';
import {
  PORTION_DEFAULTS,
  PORTION_KEYS,
  PORTION_MAX,
  PORTION_MIN,
  PORTION_STEP,
  type PortionKey,
  type PortionPrefs,
} from '@/features/portions/logic';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Collapsible } from './Collapsible';
import { PressableScale } from './Motion';
import { InlineError } from './StateViews';

const EMOJI: Record<PortionKey, string> = { pasta: '🍝', riso: '🍚', carne: '🥩', pesce: '🐟' };

/** Profilo → grammi a persona di pasta, riso, carne e pesce (usati in ricette, cucina e spesa). */
export function PortionsCard() {
  const { t } = useTranslation();
  const settings = useProfileSettings();
  const update = useUpdateProfileSettings();
  const prefs = settings.data?.portions ?? {};
  const set = (next: PortionPrefs) => update.mutate({ portions: next });
  const summary = PORTION_KEYS.filter((k) => prefs[k])
    .map((k) => `${EMOJI[k]} ${prefs[k]} g`)
    .join(' · ');

  return (
    <Collapsible title={t('portions.title')} summary={summary || t('portions.summaryNone')}>
      <AppText tone="secondary">{t('portions.hint')}</AppText>
      {PORTION_KEYS.map((key) => {
        const value = prefs[key];
        const change = (delta: number) => {
          const start = value ?? PORTION_DEFAULTS[key];
          set({ ...prefs, [key]: Math.min(PORTION_MAX, Math.max(PORTION_MIN, start + delta)) });
        };
        const reset = () => {
          const { [key]: _removed, ...rest } = prefs;
          set(rest);
        };
        return (
          <View key={key} style={styles.row}>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">
                {EMOJI[key]} {t(`portions.${key}`)}
              </AppText>
              {value !== undefined ? (
                <Pressable onPress={reset} accessibilityRole="button" hitSlop={6}>
                  <AppText variant="caption" tone="primary">
                    {t('portions.reset')}
                  </AppText>
                </Pressable>
              ) : (
                <AppText variant="caption" tone="secondary">
                  {t('portions.asRecipe')}
                </AppText>
              )}
            </View>
            <Step label="−" a11y={t('portions.less', { food: t(`portions.${key}`) })} onPress={() => change(-PORTION_STEP)} />
            <AppText variant="bodyStrong" style={styles.value}>
              {value !== undefined ? `${value} g` : '—'}
            </AppText>
            <Step label="+" a11y={t('portions.more', { food: t(`portions.${key}`) })} onPress={() => change(PORTION_STEP)} />
          </View>
        );
      })}
      <InlineError message={update.isError ? errorMessage(update.error, t) : null} />
    </Collapsible>
  );
}

function Step({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      scaleTo={0.88}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={4}
      style={[styles.step, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
      <AppText variant="heading">{label}</AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1, gap: 2 },
  value: { minWidth: 64, textAlign: 'center' },
  step: { width: 40, height: 40, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
