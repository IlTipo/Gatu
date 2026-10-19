import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { InlineError, LoadingState } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { useDietPlan, useSaveDietPlan } from '@/features/diet/api';
import { takeDietDraft } from '@/features/diet/draft';
import { DIET_SLOTS, type DietDay, type DietOption, type DietPlan, type DietSlot, optionsFromText, SLOT_EMOJI } from '@/features/diet/types';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

const WEEK = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

type EditDay = { label: string; weekday: number | null; slots: Record<DietSlot, string>; original: DietDay | null };

const toEdit = (d: DietDay): EditDay => ({
  label: d.label,
  weekday: d.weekday,
  original: d,
  slots: Object.fromEntries(
    DIET_SLOTS.map((s) => [s, d.meals.filter((m) => m.slot === s).flatMap((m) => m.options.map((o) => o.text)).join('\n')]),
  ) as Record<DietSlot, string>,
});
const emptyDay = (index: number): EditDay => ({
  label: WEEK[index] ?? `Giorno ${index + 1}`,
  weekday: index < 7 ? index + 1 : null,
  original: null,
  slots: Object.fromEntries(DIET_SLOTS.map((s) => [s, ''])) as Record<DietSlot, string>,
});

/** Righe del testo → alternative; se una riga non è cambiata tiene gli alimenti letti dall'AI. */
function fromEdit(d: EditDay): DietDay {
  const known = new Map<string, DietOption>((d.original?.meals ?? []).flatMap((m) => m.options.map((o) => [o.text, o] as const)));
  return {
    label: d.label.trim().slice(0, 40) || 'Giorno',
    weekday: d.weekday,
    meals: DIET_SLOTS.flatMap((slot) => {
      const options = optionsFromText(d.slots[slot]).map((o) => known.get(o.text) ?? o);
      return options.length ? [{ slot, options }] : [];
    }),
  };
}

/** Scrivi o correggi il piano: per ogni giorno, i pasti con una riga per alternativa. */
export default function DietEditScreen() {
  const saved = useDietPlan();
  const [draft] = useState(takeDietDraft);
  if (!draft && saved.isPending) return <Screen><LoadingState /></Screen>;
  return <Editor initial={draft ?? saved.data ?? null} />;
}

function Editor({ initial }: { initial: DietPlan | null }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const save = useSaveDietPlan();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [notes, setNotes] = useState((initial?.notes ?? []).join('\n'));
  const [days, setDays] = useState<EditDay[]>(() => (initial?.days.length ? initial.days.map(toEdit) : [emptyDay(0)]));
  const [message, setMessage] = useState<string | null>(null);

  const update = (i: number, patch: Partial<EditDay>) => setDays(days.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  const submit = () => {
    const plan: DietPlan = {
      title: title.trim().slice(0, 100) || null,
      notes: notes.split('\n').map((n) => n.trim().slice(0, 200)).filter(Boolean).slice(0, 10),
      days: days.map(fromEdit).filter((d) => d.meals.length),
    };
    if (!plan.days.length) return setMessage(t('diet.emptyPlan'));
    save.mutate(plan, { onSuccess: () => router.replace('/diet') });
  };

  return (
    <Screen scroll>
      <View style={styles.container}>
        <BackButton fallback="/diet" />
        <AppText variant="title">{t('diet.editTitle')}</AppText>
        <TextField label={t('diet.planTitle')} value={title} onChangeText={setTitle} maxLength={100} />
        {days.map((day, i) => (
          <View key={i} style={[styles.day, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TextField label={t('diet.dayLabel')} value={day.label} onChangeText={(v) => update(i, { label: v })} maxLength={40} />
            <AppText variant="caption" tone="secondary">
              {t('diet.slotHint')}
            </AppText>
            {DIET_SLOTS.map((slot) => (
              <TextField
                key={slot}
                label={`${SLOT_EMOJI[slot]} ${t(`diet.slots.${slot}`)}`}
                value={day.slots[slot]}
                onChangeText={(v) => update(i, { slots: { ...day.slots, [slot]: v } })}
                multiline
                maxLength={1500}
                // il campo cresce con le righe (una per alternativa)
                style={{ minHeight: Math.max(50, 30 * (day.slots[slot].split('\n').length + Math.floor(day.slots[slot].length / 40)) + 24) }}
              />
            ))}
            {days.length > 1 ? (
              <Button label={t('diet.removeDay')} variant="ghost" onPress={() => setDays(days.filter((_, k) => k !== i))} />
            ) : null}
          </View>
        ))}
        {days.length < 14 ? <Button label={t('diet.addDay')} variant="secondary" onPress={() => setDays([...days, emptyDay(days.length)])} /> : null}
        <TextField label={t('diet.notesLabel')} value={notes} onChangeText={setNotes} multiline maxLength={2000} />
        {message ? <AppText tone="secondary">{message}</AppText> : null}
        <InlineError message={save.isError ? errorMessage(save.error, t) : null} />
        <Button label={t('diet.save')} onPress={submit} loading={save.isPending} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  day: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
});
