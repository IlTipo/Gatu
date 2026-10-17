import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Stars } from '@/components/RatingCard';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { TimersBar } from '@/components/TimersBar';
import { ingredientsForStep, timerLabel, type VoiceCommand } from '@/features/cooking/logic';
import { startTimer, stopRinging, useTimers } from '@/features/cooking/timers';
import { useVoiceCommands, voiceSupported } from '@/features/cooking/voice';
import { useUpdateMeta } from '@/features/ratings/api';
import { useRecipe } from '@/features/recipes/api';
import { formatIngredient, formatMinutes, scaleQuantity } from '@/features/recipes/format';
import type { Ingredient, RecipeWithDetails } from '@/features/recipes/types';
import { errorMessage } from '@/lib/errors';
import { useScreenAwake } from '@/lib/keepAwake';
import { radius, spacing, useTheme } from '@/theme';

const PEOPLE = [1, 2, 3, 4, 5, 6];

/** Modalità cucina: preparazione degli ingredienti, poi un passaggio alla volta. */
export default function CookScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipe = useRecipe(id);
  useScreenAwake(`cook-${id}`);

  if (recipe.isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  if (recipe.isError) {
    return (
      <Screen>
        <BackButton />
        <ErrorState message={errorMessage(recipe.error, t)} onRetry={() => recipe.refetch()} />
      </Screen>
    );
  }
  return <Cooking recipe={recipe.data} />;
}

type Phase = 'prep' | 'steps' | 'done';

function Cooking({ recipe: r }: { recipe: RecipeWithDetails }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>('prep');
  const [index, setIndex] = useState(0);
  const [people, setPeople] = useState<number | null>(r.servings);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [voiceOn, setVoiceOn] = useState(false);
  const timers = useTimers();
  const meta = useUpdateMeta('recipe', r.id);
  const saveMeta = meta.mutate; // funzione stabile: non fa ricreare i comandi a ogni rendering
  const [rated, setRated] = useState<number | null>(r.rating);

  const base = r.servings;
  const factor = base && people ? people / base : 1;
  const show = useCallback(
    (i: Ingredient) => formatIngredient({ ...i, quantity: scaleQuantity(i.quantity, i.unit, factor) }),
    [factor],
  );
  const steps = r.recipe_steps;
  const step = steps[index];
  const stepIngredients = useMemo(
    () => (step ? ingredientsForStep(step.text, r.recipe_ingredients) : []),
    [step, r.recipe_ingredients],
  );
  const stepTimerRunning = step ? timers.some((x) => x.label === timerLabel(index + 1, step.text)) : false;

  const exit = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/recipe/[id]', params: { id: r.id } }));
  const next = useCallback(() => {
    if (phase === 'prep') setPhase(steps.length ? 'steps' : 'done');
    else if (phase === 'steps') {
      if (index < steps.length - 1) setIndex(index + 1);
      else {
        setPhase('done');
        // arrivati in fondo: la ricetta è stata cucinata
        saveMeta({ status: 'tried', done_at: new Date().toISOString() });
      }
    }
  }, [phase, index, steps.length, saveMeta]);
  const prev = useCallback(() => {
    if (phase === 'done') setPhase(steps.length ? 'steps' : 'prep');
    else if (phase === 'steps') {
      if (index > 0) setIndex(index - 1);
      else setPhase('prep');
    }
  }, [phase, index, steps.length]);
  const startStepTimer = useCallback(() => {
    if (phase !== 'steps' || !step?.timer_seconds || stepTimerRunning) return;
    startTimer(timerLabel(index + 1, step.text), step.timer_seconds, r.id);
  }, [phase, step, index, stepTimerRunning, r.id]);

  const onVoice = useCallback(
    (cmd: VoiceCommand) => {
      if (cmd === 'next') next();
      else if (cmd === 'prev') prev();
      else if (cmd === 'timer') startStepTimer();
      else stopRinging();
    },
    [next, prev, startStepTimer],
  );
  const voice = useVoiceCommands(voiceOn, onVoice);

  // sul computer: frecce ← → per spostarsi
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  const toggle = (id: string) =>
    setChecked((old) => {
      const copy = new Set(old);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });

  let body;
  if (phase === 'prep') {
    const choices = base && !PEOPLE.includes(base) ? [...PEOPLE, base] : PEOPLE;
    body = (
      <View style={styles.section}>
        <AppText variant="title">{t('cook.prepTitle')}</AppText>
        {base ? (
          <View style={styles.block}>
            <AppText variant="caption" tone="secondary">
              {t('cook.people')}
            </AppText>
            <View style={styles.chips}>
              {choices.map((n) => (
                <Chip
                  key={n}
                  label={n === base ? `${n} · ${t('recipe.original')}` : String(n)}
                  selected={people === n}
                  onPress={() => setPeople(n)}
                />
              ))}
            </View>
          </View>
        ) : null}
        <View style={styles.block}>
          <AppText variant="heading">{t('cook.checklist')}</AppText>
          {r.recipe_ingredients.length ? (
            <>
              <AppText tone="secondary">
                {t('cook.checklistHint')} {t('cook.ready', { done: checked.size, total: r.recipe_ingredients.length })}
              </AppText>
              {r.recipe_ingredients.map((i) => {
                const on = checked.has(i.id);
                return (
                  <Pressable
                    key={i.id}
                    onPress={() => toggle(i.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    style={({ pressed }) => [
                      styles.check,
                      { borderColor: colors.border, backgroundColor: on ? colors.surfaceMuted : colors.surface, opacity: pressed ? 0.7 : 1 },
                    ]}>
                    <View
                      style={[
                        styles.box,
                        { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : 'transparent' },
                      ]}>
                      {on ? (
                        <AppText variant="caption" tone="onPrimary">
                          ✓
                        </AppText>
                      ) : null}
                    </View>
                    <AppText
                      style={[styles.flex, on && { textDecorationLine: 'line-through', color: colors.textSecondary }]}>
                      {show(i)}
                    </AppText>
                  </Pressable>
                );
              })}
            </>
          ) : (
            <AppText tone="secondary">{t('cook.noIngredients')}</AppText>
          )}
        </View>
      </View>
    );
  } else if (phase === 'steps' && step) {
    body = (
      <View style={styles.section}>
        <AppText variant="bodyStrong" tone="primary">
          {t('cook.stepOf', { n: index + 1, total: steps.length })}
        </AppText>
        <View style={[styles.progress, { backgroundColor: colors.surfaceMuted }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${((index + 1) / steps.length) * 100}%` }]} />
        </View>
        <AppText style={styles.stepText}>{step.text}</AppText>
        {step.timer_seconds ? (
          <Button
            label={
              stepTimerRunning
                ? t('cook.timerRunning')
                : t('cook.startTimer', { time: formatMinutes(Math.round(step.timer_seconds / 60)) ?? `${step.timer_seconds} s` })
            }
            variant="secondary"
            onPress={startStepTimer}
            disabled={stepTimerRunning}
          />
        ) : null}
        {stepIngredients.length ? (
          <View style={[styles.need, { backgroundColor: colors.surfaceMuted }]}>
            <AppText variant="caption" tone="secondary">
              {t('cook.stepIngredients')}
            </AppText>
            {stepIngredients.map((i) => (
              <AppText key={i.id} variant="bodyStrong">
                • {show(i)}
              </AppText>
            ))}
          </View>
        ) : null}
      </View>
    );
  } else {
    body = (
      <View style={[styles.section, styles.center]}>
        <AppText variant="title">{t('cook.doneTitle')}</AppText>
        <AppText tone="secondary">{steps.length ? t('cook.doneBody') : t('cook.noSteps')}</AppText>
        {steps.length ? (
          <View style={[styles.need, { backgroundColor: colors.surfaceMuted }]}>
            <AppText variant="heading">{t('rating.quickTitle')}</AppText>
            <Stars
              value={rated}
              onChange={(value) => {
                setRated(value);
                saveMeta({ rating: value, status: 'tried', done_at: new Date().toISOString() });
              }}
            />
            <AppText variant="caption" tone="secondary">
              {t('rating.quickBody')}
            </AppText>
          </View>
        ) : null}
        <Button label={t('cook.backToRecipe')} onPress={exit} />
      </View>
    );
  }

  return (
    <Screen>
      <View style={styles.top}>
        <Pressable onPress={exit} accessibilityRole="button" hitSlop={8}>
          <AppText variant="bodyStrong" tone="primary">
            {t('cook.exit')}
          </AppText>
        </Pressable>
        <AppText variant="caption" tone="secondary" numberOfLines={1} style={styles.flex}>
          {r.title}
        </AppText>
        {voiceSupported() ? (
          <Pressable
            onPress={() => setVoiceOn((v) => !v)}
            accessibilityRole="switch"
            accessibilityState={{ checked: voiceOn }}
            accessibilityLabel={voiceOn ? t('cook.voiceStop') : t('cook.voiceOff')}
            style={[styles.mic, { backgroundColor: voiceOn ? colors.primary : colors.surfaceMuted }]}>
            <AppText variant="heading">🎤</AppText>
          </Pressable>
        ) : null}
      </View>
      {voiceOn || voice.error ? (
        <AppText variant="caption" tone={voice.error ? 'danger' : 'primary'} style={styles.voice}>
          {voice.error === 'denied'
            ? t('cook.voiceDenied')
            : voice.error === 'failed'
              ? t('cook.voiceFailed')
              : voice.heard
                ? t('cook.heard', { text: voice.heard })
                : t('cook.voiceOn')}
        </AppText>
      ) : null}
      <TimersBar />
      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
        {body}
        {phase === 'steps' && timers.length ? (
          <AppText variant="caption" tone="secondary">
            {t('cook.notifyHint')}
          </AppText>
        ) : null}
      </ScrollView>
      {phase !== 'done' ? (
        <View style={[styles.nav, { borderTopColor: colors.border }]}>
          {phase === 'steps' ? (
            <View style={styles.flex}>
              <Button label={t('cook.prev')} variant="secondary" onPress={prev} />
            </View>
          ) : null}
          <View style={styles.flex}>
            <Button
              label={phase === 'prep' ? t('cook.start') : index === steps.length - 1 ? t('cook.finish') : t('cook.next')}
              onPress={next}
            />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  mic: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  voice: { marginBottom: spacing.sm },
  scroll: { gap: spacing.lg, paddingVertical: spacing.md, paddingBottom: spacing.xl },
  section: { gap: spacing.lg },
  center: { alignItems: 'stretch', paddingTop: spacing.xl },
  block: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  box: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  progress: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6 },
  stepText: { fontSize: 24, lineHeight: 34, fontWeight: '500' },
  need: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md },
  nav: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  flex: { flex: 1 },
});
