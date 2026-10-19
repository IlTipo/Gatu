import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Collapsible } from '@/components/Collapsible';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { useLibraryRecipes } from '@/features/library/api';
import { splitPantryInput } from '@/features/library/pantry';
import { useWeekPlan } from '@/features/planner/api';
import { addDays, startOfWeek, toISODate, weekLabel } from '@/features/planner/dates';
import { AISLE_LABELS } from '@/features/recipes/constants';
import { formatIngredient } from '@/features/recipes/format';
import {
  applyTemplate,
  shoppingKeys,
  useAddTemplateItems,
  useCopyWeek,
  useDeleteTemplate,
  useSaveTemplate,
  useShoppingTemplate,
  type NewItem,
  type ShoppingItem,
  useAddManualItems,
  useShoppingScan,
  useClearChecked,
  useDeleteItem,
  useGenerateList,
  useShoppingList,
  useMoveToAisle,
  useToggleItem,
} from '@/features/shopping/api';
import { AISLE_EMOJI, AISLES, aisleRank, moveAisleInOrder, setAisleOrder, useAislePrefs } from '@/features/shopping/aisles';
import { displayAmount, listAsText } from '@/features/shopping/build';
import { errorMessage } from '@/lib/errors';
import { pickRecipePhoto } from '@/lib/photo';
import { radius, spacing, useTheme } from '@/theme';

const aisleLabel = (aisle: string) => AISLE_LABELS[aisle] ?? AISLE_LABELS.altro;
const aisleTitle = (aisle: string) => `${AISLE_EMOJI[aisle] ?? AISLE_EMOJI.altro} ${aisleLabel(aisle)}`;
const formatItem = (i: Pick<ShoppingItem, 'name' | 'quantity' | 'unit'>) =>
  formatIngredient({ ...displayAmount(i.quantity, i.unit), name: i.name, note: null });

/** Messaggio per una lettura AI non riuscita. */
function aiProblem(res: { status: 'skipped' | 'error'; reason: string }, t: TFunction) {
  if (res.status === 'skipped') return t(`recipe.aiSkipped.${res.reason as 'not_configured' | 'quota_exceeded'}`);
  return res.reason === 'rate_limited' ? t('recipe.aiRateLimited') : res.reason === 'overloaded' ? t('recipe.aiBusy') : t('recipe.aiError');
}

export default function ShoppingScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const today = toISODate(new Date());
  const [monday, setMonday] = useState(() => startOfWeek(today));
  const list = useShoppingList(monday);
  const plan = useWeekPlan(monday);
  const recipes = useLibraryRecipes();
  const generate = useGenerateList(monday);
  const addItems = useAddManualItems(monday);
  const clearChecked = useClearChecked(monday);
  const scan = useShoppingScan();
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<unknown>(null);
  // voci lette dalla foto, da confermare prima di metterle in lista
  const [found, setFound] = useState<(NewItem & { keep: boolean })[] | null>(null);
  // l'ordine dei reparti del tuo supermercato
  const { order: aisleOrder } = useAislePrefs();
  const copy = useCopyWeek();
  const template = useShoppingTemplate();
  const queryClient = useQueryClient();
  const hasTemplate = !!template.data?.length;

  // lista fissa: alla prima apertura di ogni settimana (da questa in poi) si aggiunge da sola
  useEffect(() => {
    if (!hasTemplate) return;
    let alive = true;
    applyTemplate(monday)
      .then((n) => {
        if (!alive || !n) return;
        queryClient.invalidateQueries({ queryKey: shoppingKeys.week(monday) });
        setMessage(t('shopping.templateApplied', { count: n }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [hasTemplate, monday, queryClient, t]);

  const titles = useMemo(() => new Map((recipes.data ?? []).map((r) => [r.id, r.title])), [recipes.data]);
  const items = useMemo(() => list.data ?? [], [list.data]);
  // da comprare (per reparto) e già presi (in fondo, a parte)
  const toBuy = useMemo(() => {
    const map = new Map<string, ShoppingItem[]>();
    for (const i of items) if (!i.checked) map.set(i.aisle, [...(map.get(i.aisle) ?? []), i]);
    return [...map.entries()].sort(([a], [b]) => aisleRank(a, aisleOrder) - aisleRank(b, aisleOrder));
  }, [items, aisleOrder]);
  const taken = useMemo(() => items.filter((i) => i.checked), [items]);

  const done = taken.length;
  const left = items.length - done;
  const meals = plan.data?.length ?? 0;
  const hasGenerated = items.some((i) => !i.is_manual);

  const goWeek = (delta: number) => {
    setMessage(null);
    setCopyMessage(null);
    setFound(null);
    setMonday(addDays(monday, delta * 7));
  };
  const runGenerate = () => {
    setMessage(null);
    generate.mutate(items, { onSuccess: (r) => setMessage(t('shopping.generated', { count: r.items })) });
  };
  const addManual = () => {
    const names = splitPantryInput(draft).slice(0, 30);
    if (!names.length) return;
    addItems.mutate({ items: names.map((name) => ({ name })), position: items.length + 1000 }, { onSuccess: () => setDraft('') });
  };
  const fromPhoto = async () => {
    setPhotoError(null);
    setMessage(null);
    setFound(null);
    try {
      const picked = await pickRecipePhoto();
      if (!picked) return;
      const res = await scan.mutateAsync({ base64: picked.base64, mimeType: picked.mimeType });
      if (res.status !== 'done') {
        setMessage(aiProblem(res, t));
        return;
      }
      if (!res.items.length) {
        setMessage(t('shopping.photoNone'));
        return;
      }
      setFound(res.items.map((i) => ({ ...i, keep: true })));
    } catch (e) {
      setPhotoError(e);
    }
  };
  const addFound = () => {
    const chosen = (found ?? []).filter((i) => i.keep).map(({ keep: _keep, ...item }) => item);
    if (!chosen.length) return setFound(null);
    addItems.mutate(
      { items: chosen, position: items.length + 1000 },
      {
        onSuccess: () => {
          setFound(null);
          setMessage(t('shopping.photoAdded', { count: chosen.length }));
        },
      },
    );
  };
  const share = async () => {
    const text = listAsText(
      t('shopping.shareTitle', { week: weekLabel(monday) }),
      [...items].filter((i) => !i.checked).sort((a, b) => aisleRank(a.aisle, aisleOrder) - aisleRank(b.aisle, aisleOrder)),
      aisleTitle,
      formatItem,
    );
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'share' in navigator) {
        await navigator.share({ text });
        return;
      }
      await Clipboard.setStringAsync(text);
      setMessage(t('shopping.copied'));
    } catch (e) {
      // condivisione annullata dall'utente: non è un errore
      if (e instanceof Error && e.name === 'AbortError') return;
      try {
        await Clipboard.setStringAsync(text);
        setMessage(t('shopping.copied'));
      } catch {
        setMessage(t('shopping.shareFailed'));
      }
    }
  };

  // in cima: scrivi cosa ti serve o fotografa una lista
  const addCard = (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.addRow}>
        <View style={styles.flex}>
          <TextField
            label={t('shopping.addLabel')}
            value={draft}
            onChangeText={setDraft}
            placeholder={t('shopping.addPlaceholder')}
            returnKeyType="done"
            onSubmitEditing={addManual}
            blurOnSubmit={false}
          />
        </View>
        <View style={styles.addButton}>
          <Button label={t('shopping.add')} variant="secondary" onPress={addManual} disabled={!draft.trim()} loading={addItems.isPending && !found} />
        </View>
      </View>
      <Button
        label={scan.isPending ? t('shopping.photoReading') : t('shopping.photo')}
        variant="secondary"
        onPress={fromPhoto}
        loading={scan.isPending}
      />
      {found ? (
        <View style={styles.found}>
          <AppText variant="bodyStrong">{t('shopping.photoFound', { count: found.length })}</AppText>
          <AppText variant="caption" tone="secondary">
            {t('shopping.photoHint')}
          </AppText>
          {found.map((item, index) => (
            <Pressable
              key={`${item.name}-${index}`}
              onPress={() => setFound(found.map((f, i) => (i === index ? { ...f, keep: !f.keep } : f)))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.keep }}
              style={styles.foundRow}>
              <View
                style={[
                  styles.box,
                  { borderColor: item.keep ? colors.primary : colors.border, backgroundColor: item.keep ? colors.primary : 'transparent' },
                ]}>
                {item.keep ? (
                  <AppText variant="caption" tone="onPrimary">
                    ✓
                  </AppText>
                ) : null}
              </View>
              <AppText style={!item.keep ? { color: colors.textSecondary } : undefined}>
                {formatItem({ name: item.name, quantity: item.quantity ?? null, unit: item.unit ?? null })}
              </AppText>
            </Pressable>
          ))}
          <Button
            label={t('shopping.photoAdd', { count: found.filter((f) => f.keep).length })}
            onPress={addFound}
            disabled={!found.some((f) => f.keep)}
            loading={addItems.isPending}
          />
          <Button label={t('common.cancel')} variant="ghost" onPress={() => setFound(null)} />
        </View>
      ) : null}
    </View>
  );

  let body;
  if (list.isPending || plan.isPending) body = <LoadingState />;
  else if (list.isError) body = <ErrorState message={errorMessage(list.error, t)} onRetry={() => list.refetch()} />;
  else if (plan.isError) body = <ErrorState message={errorMessage(plan.error, t)} onRetry={() => plan.refetch()} />;
  else {
    body = (
      <View style={styles.content}>
        {addCard}
        {message ? <AppText tone="secondary">{message}</AppText> : null}

        {!items.length ? (
          <EmptyState
            icon={<Icon name={{ ios: 'cart', android: 'shopping_cart' }} size={32} color={colors.primary} />}
            title={t('shopping.emptyTitle')}
            body={meals ? t('shopping.emptyBody') : t('shopping.emptyFree')}
            action={
              meals ? (
                <Button label={t('shopping.generate')} variant="secondary" onPress={runGenerate} loading={generate.isPending} />
              ) : (
                <Button label={t('shopping.openPlanner')} variant="ghost" onPress={() => router.push('/planner')} />
              )
            }
          />
        ) : (
          <>
            <View style={styles.progressRow}>
              <AppText variant="bodyStrong">
                {left === 0 ? t('shopping.allDone') : t('shopping.progress', { done, total: items.length })}
              </AppText>
            </View>
            <View style={[styles.bar, { backgroundColor: colors.surfaceMuted }]}>
              <View style={[styles.barFill, { backgroundColor: colors.primary, width: `${(done / items.length) * 100}%` }]} />
            </View>

            {left ? (
              <AppText variant="heading">
                {t('shopping.toBuy')} · {left}
              </AppText>
            ) : null}
            {toBuy.map(([aisle, list]) => (
              <View key={aisle} style={styles.group}>
                <AppText variant="caption" tone="secondary" style={styles.aisle}>
                  {aisleTitle(aisle)}
                </AppText>
                {list.map((item) => (
                  <ItemRow key={item.id} item={item} monday={monday} titles={titles} />
                ))}
              </View>
            ))}

            {taken.length ? (
              <View style={styles.group}>
                <View style={styles.takenHeader}>
                  <AppText variant="heading" style={styles.flex}>
                    ✓ {t('shopping.taken')} · {taken.length}
                  </AppText>
                  <Button label={t('shopping.clearChecked')} variant="ghost" onPress={() => clearChecked.mutate()} loading={clearChecked.isPending} />
                </View>
                <AppText variant="caption" tone="secondary">
                  {t('shopping.takenHint')}
                </AppText>
                {taken.map((item) => (
                  <ItemRow key={item.id} item={item} monday={monday} titles={titles} />
                ))}
              </View>
            ) : null}
          </>
        )}

        {items.length ? <AisleOrderCard /> : null}

        <TemplateCard monday={monday} hasItems={items.length > 0} />

        {items.length ? (
          <View style={styles.actions}>
            {left ? <Button label={t('shopping.share')} onPress={share} /> : null}
            <Button
              label={t('shopping.copyNext')}
              variant="secondary"
              loading={copy.isPending}
              onPress={() => {
                const next = addDays(monday, 7);
                copy.mutate(
                  { from: monday, to: next },
                  { onSuccess: (n) => setCopyMessage(n ? t('shopping.copied_next', { count: n, week: weekLabel(next) }) : t('shopping.copiedNone')) },
                );
              }}
            />
            {copyMessage ? (
              <View style={styles.takenHeader}>
                <AppText tone="secondary" style={styles.flex}>
                  {copyMessage}
                </AppText>
                <Chip label={t('shopping.goNext')} onPress={() => goWeek(1)} />
              </View>
            ) : null}
            {meals ? (
              <>
                <Button
                  label={hasGenerated ? t('shopping.regenerate') : t('shopping.generate')}
                  variant="secondary"
                  onPress={runGenerate}
                  loading={generate.isPending}
                />
                {hasGenerated ? (
                  <AppText variant="caption" tone="secondary">
                    {t('shopping.regenerateHint')}
                  </AppText>
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}
        <InlineError
          message={
            photoError
              ? errorMessage(photoError, t)
              : scan.isError
                ? errorMessage(scan.error, t)
                : generate.isError
                  ? errorMessage(generate.error, t)
                  : addItems.isError
                    ? errorMessage(addItems.error, t)
                    : clearChecked.isError
                      ? errorMessage(clearChecked.error, t)
                      : copy.isError
                        ? errorMessage(copy.error, t)
                        : null
          }
        />
      </View>
    );
  }

  return (
    <Screen>
      <BackButton />
      <AppText variant="title">{t('shopping.title')}</AppText>
      <View style={styles.weekNav}>
        <Arrow label={t('planner.prevWeek')} symbol="‹" onPress={() => goWeek(-1)} />
        <View style={styles.weekCenter}>
          <AppText variant="bodyStrong">{weekLabel(monday)}</AppText>
          {monday !== startOfWeek(today) ? (
            <Pressable onPress={() => setMonday(startOfWeek(today))} accessibilityRole="button">
              <AppText variant="caption" tone="primary">
                {t('planner.thisWeek')}
              </AppText>
            </Pressable>
          ) : null}
        </View>
        <Arrow label={t('planner.nextWeek')} symbol="›" onPress={() => goWeek(1)} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
    </Screen>
  );
}

function Arrow({ label, symbol, onPress }: { label: string; symbol: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.arrow, { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.6 : 1 }]}>
      <AppText variant="heading">{symbol}</AppText>
    </Pressable>
  );
}

function ItemRow({ item, monday, titles }: { item: ShoppingItem; monday: string; titles: Map<string, string> }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const toggle = useToggleItem(monday);
  const remove = useDeleteItem(monday);
  const move = useMoveToAisle(monday);
  const [picking, setPicking] = useState(false);
  const recipeNames = item.recipe_ids
    .map((id) => titles.get(id))
    .filter(Boolean)
    .join(', ');
  const from = item.is_manual ? t('shopping.manual') : recipeNames ? t('shopping.fromRecipes', { list: recipeNames }) : null;

  return (
    <View style={[styles.item, { borderColor: colors.border, backgroundColor: item.checked ? colors.surfaceMuted : colors.surface }]}>
      <Pressable
        style={styles.itemMain}
        onPress={() => toggle.mutate({ id: item.id, checked: !item.checked })}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked }}
        accessibilityLabel={formatItem(item)}>
        <View
          style={[
            styles.box,
            { borderColor: item.checked ? colors.primary : colors.border, backgroundColor: item.checked ? colors.primary : 'transparent' },
          ]}>
          {item.checked ? (
            <AppText variant="caption" tone="onPrimary">
              ✓
            </AppText>
          ) : null}
        </View>
        <View style={styles.flex}>
          <AppText
            variant="bodyStrong"
            style={item.checked ? { textDecorationLine: 'line-through', color: colors.textSecondary } : undefined}>
            {formatItem(item)}
          </AppText>
          {from ? (
            <AppText variant="caption" tone="secondary" numberOfLines={1}>
              {from}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        onPress={() => setPicking((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={t('shopping.changeAisle')}
        hitSlop={8}>
        <AppText variant="bodyStrong">{AISLE_EMOJI[item.aisle] ?? AISLE_EMOJI.altro}</AppText>
      </Pressable>
      {item.is_manual ? (
        <Pressable onPress={() => remove.mutate(item.id)} accessibilityRole="button" accessibilityLabel={t('shopping.remove')} hitSlop={8}>
          <AppText variant="bodyStrong" tone="secondary">
            ✕
          </AppText>
        </Pressable>
      ) : null}
      {picking ? (
        <View style={styles.picker}>
          <AppText variant="caption" tone="secondary">
            {t('shopping.moveTo')}
          </AppText>
          <View style={styles.chips}>
            {AISLES.map((a) => (
              <Chip
                key={a}
                label={aisleTitle(a)}
                selected={item.aisle === a}
                onPress={() => {
                  setPicking(false);
                  if (a !== item.aisle) move.mutate({ id: item.id, name: item.name, aisle: a });
                }}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** ⭐ Lista fissa: le cose che compri sempre, aggiunte da sole a ogni settimana nuova. */
function TemplateCard({ monday, hasItems }: { monday: string; hasItems: boolean }) {
  const { t } = useTranslation();
  const template = useShoppingTemplate();
  const save = useSaveTemplate();
  const add = useAddTemplateItems();
  const remove = useDeleteTemplate();
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const list = template.data ?? [];
  const addDraft = () => {
    const names = splitPantryInput(draft).slice(0, 30);
    if (!names.length) return;
    add.mutate({ names, position: list.length + 1 }, { onSuccess: () => setDraft('') });
  };
  return (
    <Collapsible
      title={t('shopping.templateTitle')}
      summary={list.length ? t('shopping.templateSummary', { count: list.length }) : t('shopping.templateSummaryNone')}>
      <AppText tone="secondary">{t('shopping.templateHint')}</AppText>
      {list.map((item) => (
        <View key={item.id} style={styles.orderRow}>
          <AppText style={styles.flex}>
            {AISLE_EMOJI[item.aisle] ?? AISLE_EMOJI.altro} {formatItem(item)}
          </AppText>
          <Pressable onPress={() => remove.mutate(item.id)} accessibilityRole="button" accessibilityLabel={t('shopping.remove')} hitSlop={8}>
            <AppText variant="bodyStrong" tone="secondary">
              ✕
            </AppText>
          </Pressable>
        </View>
      ))}
      <View style={styles.addRow}>
        <View style={styles.flex}>
          <TextField
            label={t('shopping.templateAdd')}
            value={draft}
            onChangeText={setDraft}
            placeholder={t('shopping.addPlaceholder')}
            returnKeyType="done"
            onSubmitEditing={addDraft}
            blurOnSubmit={false}
          />
        </View>
        <View style={styles.addButton}>
          <Button label={t('shopping.add')} variant="secondary" onPress={addDraft} disabled={!draft.trim()} loading={add.isPending} />
        </View>
      </View>
      {hasItems ? (
        <Button
          label={list.length ? t('shopping.templateReplace') : t('shopping.templateSave')}
          variant="secondary"
          loading={save.isPending}
          onPress={() => save.mutate(monday, { onSuccess: (n) => setMessage(t('shopping.templateSaved', { count: n })) })}
        />
      ) : null}
      {list.length ? (
        <Button
          label={t('shopping.templateRemove')}
          variant="ghost"
          loading={remove.isPending && remove.variables === null}
          onPress={() => remove.mutate(null, { onSuccess: () => setMessage(t('shopping.templateRemoved')) })}
        />
      ) : null}
      {message ? <AppText tone="secondary">{message}</AppText> : null}
      <InlineError
        message={save.isError ? errorMessage(save.error, t) : add.isError ? errorMessage(add.error, t) : remove.isError ? errorMessage(remove.error, t) : null}
      />
    </Collapsible>
  );
}

/** "Ordine dei reparti": come li trovi nel tuo supermercato (frecce su e giù). */
function AisleOrderCard() {
  const { t } = useTranslation();
  const { order } = useAislePrefs();
  return (
    <Collapsible title={t('shopping.aisleOrderTitle')} summary={t('shopping.aisleOrderSummary')}>
      {order.map((aisle, index) => (
        <View key={aisle} style={styles.orderRow}>
          <AppText style={styles.flex}>{aisleTitle(aisle)}</AppText>
          <Chip label="↑" onPress={index > 0 ? () => setAisleOrder(moveAisleInOrder(order, aisle, -1)) : undefined} />
          <Chip label="↓" onPress={index < order.length - 1 ? () => setAisleOrder(moveAisleInOrder(order, aisle, 1)) : undefined} />
        </View>
      ))}
    </Collapsible>
  );
}

const styles = StyleSheet.create({
  weekNav: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md },
  weekCenter: { flex: 1, alignItems: 'center', gap: 2 },
  arrow: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: spacing.xl * 2 },
  content: { gap: spacing.lg },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: -spacing.sm },
  barFill: { height: 6 },
  group: { gap: spacing.sm },
  aisle: { textTransform: 'uppercase', letterSpacing: 0.6 },
  picker: { width: '100%', gap: spacing.xs, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  item: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: 56 },
  box: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  card: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  found: { gap: spacing.sm },
  foundRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 4 },
  takenHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  addButton: { marginTop: 22 },
  actions: { gap: spacing.sm },
  flex: { flex: 1, gap: 2 },
});
