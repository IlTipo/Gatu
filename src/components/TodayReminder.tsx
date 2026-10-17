import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useWeekPlan } from '@/features/planner/api';
import { startOfWeek, toISODate } from '@/features/planner/dates';
import { reminderKey, slotForNow, takeOut } from '@/features/reminders/logic';
import { supabase } from '@/lib/supabase';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { FadeIn, PressableScale } from './Motion';

const DISMISS_KEY = 'morso.reminder.dismissed';
const readDismissed = () => {
  try {
    return globalThis.localStorage?.getItem(DISMISS_KEY) ?? null;
  } catch {
    return null;
  }
};

/** Libreria → "Stasera hai in programma…": il pasto di adesso dal planner e cosa tirare fuori. */
export function TodayReminder() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const now = new Date();
  const today = toISODate(now);
  const slot = slotForNow(now);
  const plan = useWeekPlan(startOfWeek(today));
  const meals = (plan.data ?? []).filter((m) => m.date === today && m.slot === slot);
  const ids = [...new Set(meals.map((m) => m.recipe_id))];
  const [dismissed, setDismissed] = useState(readDismissed);

  const recipes = useQuery({
    queryKey: ['recipes', 'reminder', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, title, recipe_ingredients(name, aisle)')
        .in('id', ids);
      if (error) throw error;
      return data as { id: string; title: string; recipe_ingredients: { name: string; aisle: string }[] }[];
    },
  });

  if (!slot || !meals.length || !recipes.data?.length) return null;
  const key = reminderKey(today, slot);
  if (dismissed === key) return null;
  const first = recipes.data[0];
  const out = takeOut(recipes.data.flatMap((r) => r.recipe_ingredients));
  const dismiss = () => {
    setDismissed(key);
    try {
      globalThis.localStorage?.setItem(DISMISS_KEY, key);
    } catch {
      // niente: si nasconde solo finché la pagina resta aperta
    }
  };

  return (
    <FadeIn>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
        <View style={styles.top}>
          <AppText variant="caption" tone="primary" style={styles.kicker}>
            {slot === 'lunch' ? t('reminder.lunch') : t('reminder.dinner')}
          </AppText>
          <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel={t('reminder.hide')} hitSlop={10}>
            <AppText tone="secondary">✕</AppText>
          </Pressable>
        </View>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {recipes.data.map((r) => r.title).join(' + ')}
        </AppText>
        {out.freezer.length ? (
          <AppText tone="secondary">🧊 {t('reminder.freezer', { list: out.freezer.join(', ') })}</AppText>
        ) : null}
        {out.fridge.length ? <AppText tone="secondary">🥶 {t('reminder.fridge', { list: out.fridge.join(', ') })}</AppText> : null}
        <PressableScale
          onPress={() => router.push({ pathname: '/recipe/[id]/cook', params: { id: first.id } })}
          accessibilityRole="button"
          style={[styles.cta, { backgroundColor: colors.primary }]}>
          <AppText variant="bodyStrong" tone="onPrimary">
            {t('reminder.cook')}
          </AppText>
        </PressableScale>
      </View>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs, marginBottom: spacing.md },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '700' },
  cta: { alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, marginTop: spacing.xs },
});
