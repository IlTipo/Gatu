import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { type FoodEstimate, useAddFood, useDayLog, useDeleteFood, useEstimateFood, useLogRecipe } from '@/features/diary/api';
import { dayTotals, groupByMealTime, MEAL_TIMES, type MealTime, mealTimeFor, parseAmount, progress } from '@/features/diary/logic';
import { useLibraryRecipes } from '@/features/library/api';
import { useWeekPlan } from '@/features/planner/api';
import { addDays, dayLabel, startOfWeek, toISODate } from '@/features/planner/dates';
import { useProfileSettings, useUpdateProfileSettings } from '@/features/portions/api';
import { errorMessage } from '@/lib/errors';
import { pickRecipePhoto } from '@/lib/photo';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { Chip } from './Chip';
import { Collapsible } from './Collapsible';
import { FadeIn } from './Motion';
import { InlineError } from './StateViews';
import { TextField } from './TextField';

/** Planner → "🔥 Calorie": diario del giorno con obiettivi, pasti del planner, stima AI o inserimento a mano. */
export function CaloriesPanel() {
  const { t } = useTranslation();
  const today = toISODate(new Date());
  const [day, setDay] = useState(today);
  const log = useDayLog(day);
  const settings = useProfileSettings();
  const goals = settings.data;
  const totals = useMemo(() => dayTotals(log.data ?? []), [log.data]);

  const summary = goals?.kcal_goal
    ? t('diary.summaryGoal', { kcal: totals.kcal, goal: goals.kcal_goal })
    : t('diary.summary', { kcal: totals.kcal });

  return (
    <Collapsible title={t('diary.title')} summary={day === today ? summary : `${dayLabel(day)} · ${summary}`}>
      <View style={styles.dayNav}>
        <Pressable onPress={() => setDay(addDays(day, -1))} accessibilityRole="button" accessibilityLabel={t('diary.prevDay')} hitSlop={8}>
          <AppText variant="heading" tone="primary">
            ‹
          </AppText>
        </Pressable>
        <Pressable onPress={() => setDay(today)} disabled={day === today} accessibilityRole="button" style={styles.dayCenter}>
          <AppText variant="bodyStrong">{day === today ? t('diary.today') : dayLabel(day)}</AppText>
        </Pressable>
        <Pressable
          onPress={() => setDay(addDays(day, 1))}
          disabled={day >= today}
          accessibilityRole="button"
          accessibilityLabel={t('diary.nextDay')}
          hitSlop={8}>
          <AppText variant="heading" tone={day >= today ? 'secondary' : 'primary'}>
            ›
          </AppText>
        </Pressable>
      </View>

      <Bar label={t('diary.kcal')} value={totals.kcal} goal={goals?.kcal_goal} unit="kcal" big />
      <View style={styles.macros}>
        <Bar label={t('recipe.protein')} value={totals.protein} goal={goals?.protein_goal} unit="g" />
        <Bar label={t('recipe.carbs')} value={totals.carbs} goal={goals?.carbs_goal} unit="g" />
        <Bar label={t('recipe.fat')} value={totals.fat} goal={goals?.fat_goal} unit="g" />
      </View>

      <Entries day={day} />
      <FromPlanner day={day} />
      <AddFood day={day} />
      <Goals />
      <AppText variant="caption" tone="secondary">
        {t('diary.disclaimer')}
      </AppText>
    </Collapsible>
  );
}

function Bar({ label, value, goal, unit, big }: { label: string; value: number; goal?: number | null; unit: string; big?: boolean }) {
  const { colors } = useTheme();
  const p = progress(value, goal);
  const over = !!goal && value > goal;
  return (
    <View style={[styles.bar, !big && styles.flex]}>
      {big ? (
        <AppText variant="bodyStrong" numberOfLines={1}>
          {label}: {value}
          {goal ? ` / ${goal}` : ''} {unit}
        </AppText>
      ) : (
        <View>
          <AppText variant="caption" tone="secondary" numberOfLines={1}>
            {label}
          </AppText>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {value}
            {goal ? `/${goal}` : ''} {unit}
          </AppText>
        </View>
      )}
      <View style={[styles.track, big && styles.trackBig, { backgroundColor: colors.surfaceMuted }]}>
        <View
          style={[
            styles.fill,
            { width: `${Math.round((p ?? 0) * 100)}%`, backgroundColor: over ? colors.danger : colors.primary },
          ]}
        />
      </View>
    </View>
  );
}

function Entries({ day }: { day: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const log = useDayLog(day);
  const remove = useDeleteFood(day);
  if (log.isPending) return <AppText tone="secondary">{t('common.loading')}</AppText>;
  if (log.isError) return <InlineError message={errorMessage(log.error, t)} />;
  if (!log.data.length) return <AppText tone="secondary">{t('diary.empty')}</AppText>;
  return (
    <View style={styles.list}>
      {groupByMealTime(log.data).map((group) => (
        <View key={group.slot} style={styles.group}>
          <AppText variant="caption" tone="secondary" style={styles.groupTitle}>
            {t(`diary.times.${group.slot}`)} · {Math.round(group.entries.reduce((s, e) => s + e.kcal, 0))} kcal
          </AppText>
          {group.entries.map((e, i) => (
            <FadeIn key={e.id} index={i}>
              <View style={[styles.entry, { backgroundColor: colors.surfaceMuted }]}>
                <View style={styles.flex}>
                  <AppText numberOfLines={2}>
                    {e.source === 'ai' ? '✨ ' : e.source === 'recipe' ? '🍽️ ' : ''}
                    {e.name}
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    {[
                      `${e.kcal} kcal`,
                      e.protein_g !== null ? `P ${Math.round(e.protein_g)} g` : null,
                      e.carbs_g !== null ? `C ${Math.round(e.carbs_g)} g` : null,
                      e.fat_g !== null ? `G ${Math.round(e.fat_g)} g` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </AppText>
                </View>
                <Pressable onPress={() => remove.mutate(e.id)} accessibilityRole="button" accessibilityLabel={t('diary.remove')} hitSlop={8}>
                  <AppText tone="secondary">✕</AppText>
                </Pressable>
              </View>
            </FadeIn>
          ))}
        </View>
      ))}
      <InlineError message={remove.isError ? errorMessage(remove.error, t) : null} />
    </View>
  );
}

/** I pasti messi nel planner per quel giorno: un tocco e finiscono nel diario (1 porzione). */
function FromPlanner({ day }: { day: string }) {
  const { t } = useTranslation();
  const plan = useWeekPlan(startOfWeek(day));
  const recipes = useLibraryRecipes();
  const logRecipe = useLogRecipe();
  const [done, setDone] = useState<Set<string>>(new Set());
  const titles = useMemo(() => new Map((recipes.data ?? []).map((r) => [r.id, r.title])), [recipes.data]);
  const meals = (plan.data ?? []).filter((m) => m.date === day);
  if (!meals.length) return null;
  return (
    <View style={styles.group}>
      <AppText variant="caption" tone="secondary" style={styles.groupTitle}>
        {t('diary.fromPlanner')}
      </AppText>
      <View style={styles.chips}>
        {meals.map((m) => (
          <Chip
            key={m.id}
            label={`${done.has(m.id) ? '✓' : '+'} ${titles.get(m.recipe_id) ?? t('planner.missingRecipe')}`}
            selected={done.has(m.id)}
            onPress={
              done.has(m.id) || logRecipe.isPending
                ? undefined
                : () =>
                    logRecipe.mutate(
                      { recipeId: m.recipe_id, date: day, slot: m.slot },
                      { onSuccess: () => setDone((s) => new Set(s).add(m.id)) },
                    )
            }
          />
        ))}
      </View>
      <InlineError message={logRecipe.isError ? errorMessage(logRecipe.error, t) : null} />
    </View>
  );
}

const empty = { name: '', kcal: '', protein: '', carbs: '', fat: '' };

/** Aggiungi: scrivi cosa hai mangiato e fai stimare all'AI (anche da foto), oppure metti i numeri a mano. */
function AddFood({ day }: { day: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [slot, setSlot] = useState<MealTime>(() => mealTimeFor(new Date().getHours()));
  const [form, setForm] = useState(empty);
  const [fromAi, setFromAi] = useState<FoodEstimate | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const estimate = useEstimateFood();
  const add = useAddFood();

  const field = (key: keyof typeof empty) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const fill = (food: FoodEstimate) => {
    setFromAi(food);
    setForm({
      name: food.name,
      kcal: String(food.kcal),
      protein: food.protein_g === null ? '' : String(food.protein_g),
      carbs: food.carbs_g === null ? '' : String(food.carbs_g),
      fat: food.fat_g === null ? '' : String(food.fat_g),
    });
  };
  const runEstimate = (photo: { base64: string; mimeType: string } | null) => {
    setMessage(null);
    estimate.mutate(
      { text: form.name.trim(), photo },
      {
        onSuccess: (res) => {
          if (res.status === 'done') fill(res.food);
          else if (res.status === 'not_food') setMessage(t('diary.notFood'));
          else if (res.status === 'skipped') setMessage(t(`recipe.aiSkipped.${res.reason}`));
          else setMessage(res.reason === 'rate_limited' ? t('recipe.aiRateLimited') : res.reason === 'overloaded' ? t('recipe.aiBusy') : t('recipe.aiError'));
        },
      },
    );
  };
  const fromPhoto = async () => {
    setPhotoBusy(true);
    try {
      const photo = await pickRecipePhoto();
      if (photo) runEstimate({ base64: photo.base64, mimeType: photo.mimeType });
    } catch {
      setMessage(t('errors.invalidImage'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const kcal = parseAmount(form.kcal, 10000);
  const protein = parseAmount(form.protein, 1000);
  const carbs = parseAmount(form.carbs, 2000);
  const fat = parseAmount(form.fat, 1000);
  const badNumber = [form.protein && protein === null, form.carbs && carbs === null, form.fat && fat === null].some(Boolean);
  const canSave = form.name.trim().length > 0 && kcal !== null && !badNumber;

  const save = () => {
    if (!canSave || kcal === null) return;
    // se hai toccato i numeri proposti dall'AI, la voce diventa "a mano"
    const edited = !fromAi || fromAi.kcal !== kcal;
    add.mutate(
      {
        eaten_on: day,
        slot,
        name: form.name.trim().slice(0, 200),
        kcal: Math.round(kcal),
        protein_g: protein,
        carbs_g: carbs,
        fat_g: fat,
        source: edited ? 'manual' : 'ai',
      },
      {
        onSuccess: () => {
          setForm(empty);
          setFromAi(null);
          setMessage(t('diary.added'));
        },
      },
    );
  };

  return (
    <View style={[styles.add, { borderColor: colors.border }]}>
      <AppText variant="bodyStrong">{t('diary.addTitle')}</AppText>
      <View style={styles.chips}>
        {MEAL_TIMES.map((m) => (
          <Chip key={m} label={t(`diary.times.${m}`)} selected={slot === m} onPress={() => setSlot(m)} />
        ))}
      </View>
      <TextField
        label={t('diary.what')}
        placeholder={t('diary.whatPlaceholder')}
        value={form.name}
        onChangeText={field('name')}
        maxLength={200}
      />
      <Button
        label={t('diary.estimate')}
        variant="secondary"
        onPress={() => runEstimate(null)}
        loading={estimate.isPending && !photoBusy}
        disabled={form.name.trim().length < 2 || estimate.isPending}
      />
      <Button label={t('diary.photo')} variant="secondary" onPress={fromPhoto} loading={photoBusy} disabled={estimate.isPending} />
      {fromAi?.items.length ? (
        <AppText variant="caption" tone="secondary">
          ✨ {fromAi.items.map((i) => `${i.name}${i.grams ? ` ${i.grams} g` : ''}${i.kcal !== null ? ` (${i.kcal} kcal)` : ''}`).join(' · ')}
        </AppText>
      ) : null}
      <AppText variant="caption" tone="secondary">
        {t('diary.manualHint')}
      </AppText>
      <View style={styles.row}>
        <NumberField label="kcal" value={form.kcal} onChange={field('kcal')} />
        <NumberField label={t('diary.proteinShort')} value={form.protein} onChange={field('protein')} />
        <NumberField label={t('diary.carbsShort')} value={form.carbs} onChange={field('carbs')} />
        <NumberField label={t('diary.fatShort')} value={form.fat} onChange={field('fat')} />
      </View>
      <Button label={t('diary.add')} onPress={save} loading={add.isPending} disabled={!canSave} />
      {message ? <AppText tone="secondary">{message}</AppText> : null}
      <InlineError
        message={estimate.isError ? errorMessage(estimate.error, t) : add.isError ? errorMessage(add.error, t) : badNumber ? t('diary.badNumber') : null}
      />
    </View>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.flex}>
      <TextField label={label} value={value} onChangeText={onChange} keyboardType="decimal-pad" inputMode="decimal" maxLength={6} />
    </View>
  );
}

/** Obiettivi giornalieri (salvati nel profilo). */
function Goals() {
  const { t } = useTranslation();
  const settings = useProfileSettings();
  const update = useUpdateProfileSettings();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kcal: '', protein: '', carbs: '', fat: '' });
  const [saved, setSaved] = useState(false);

  const start = () => {
    const g = settings.data;
    const s = (v: number | null | undefined) => (v ? String(v) : '');
    setForm({ kcal: s(g?.kcal_goal), protein: s(g?.protein_goal), carbs: s(g?.carbs_goal), fat: s(g?.fat_goal) });
    setSaved(false);
    setOpen(true);
  };
  const toInt = (text: string, min: number, max: number) => {
    const n = parseAmount(text, max);
    return n === null || n < min ? null : Math.round(n);
  };
  const kcal = toInt(form.kcal, 500, 10000);
  const invalid = (form.kcal.trim() !== '' && kcal === null) || [form.protein, form.carbs, form.fat].some((v) => v.trim() !== '' && toInt(v, 0, 2000) === null);
  const save = () =>
    update.mutate(
      {
        kcal_goal: kcal,
        protein_goal: toInt(form.protein, 0, 1000),
        carbs_goal: toInt(form.carbs, 0, 2000),
        fat_goal: toInt(form.fat, 0, 1000),
      },
      {
        onSuccess: () => {
          setSaved(true);
          setOpen(false);
        },
      },
    );

  if (!open) {
    return (
      <Pressable onPress={start} accessibilityRole="button">
        <AppText tone="primary" variant="bodyStrong">
          {saved ? `✓ ${t('diary.goalsSaved')}` : t('diary.goals')}
        </AppText>
      </Pressable>
    );
  }
  return (
    <View style={styles.group}>
      <AppText variant="bodyStrong">{t('diary.goals')}</AppText>
      <AppText variant="caption" tone="secondary">
        {t('diary.goalsHint')}
      </AppText>
      <View style={styles.row}>
        <NumberField label="kcal" value={form.kcal} onChange={(v) => setForm((f) => ({ ...f, kcal: v }))} />
        <NumberField label={t('diary.proteinShort')} value={form.protein} onChange={(v) => setForm((f) => ({ ...f, protein: v }))} />
        <NumberField label={t('diary.carbsShort')} value={form.carbs} onChange={(v) => setForm((f) => ({ ...f, carbs: v }))} />
        <NumberField label={t('diary.fatShort')} value={form.fat} onChange={(v) => setForm((f) => ({ ...f, fat: v }))} />
      </View>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button label={t('common.save')} onPress={save} loading={update.isPending} disabled={invalid} />
        </View>
        <View style={styles.flex}>
          <Button label={t('common.cancel')} variant="ghost" onPress={() => setOpen(false)} />
        </View>
      </View>
      <InlineError message={update.isError ? errorMessage(update.error, t) : invalid ? t('diary.badGoal') : null} />
    </View>
  );
}

const styles = StyleSheet.create({
  dayNav: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dayCenter: { flex: 1, alignItems: 'center' },
  macros: { flexDirection: 'row', gap: spacing.md },
  bar: { gap: 4 },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  trackBig: { height: 12 },
  fill: { height: '100%', borderRadius: radius.pill },
  list: { gap: spacing.md },
  group: { gap: spacing.sm },
  groupTitle: { textTransform: 'uppercase', letterSpacing: 0.6 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  add: { gap: spacing.sm, borderTopWidth: 1, paddingTop: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1, gap: 4 },
});
