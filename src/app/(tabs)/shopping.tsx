import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
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
  type ShoppingItem,
  useAddManualItems,
  useClearChecked,
  useDeleteItem,
  useGenerateList,
  useShoppingList,
  useToggleItem,
} from '@/features/shopping/api';
import { displayAmount, listAsText } from '@/features/shopping/build';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

// ordine dei reparti come in un supermercato
const AISLE_ORDER = ['frutta_verdura', 'panetteria', 'carne_pesce', 'latticini', 'dispensa', 'surgelati', 'bevande', 'altro'];
const aisleLabel = (aisle: string) => AISLE_LABELS[aisle] ?? AISLE_LABELS.altro;
const formatItem = (i: Pick<ShoppingItem, 'name' | 'quantity' | 'unit'>) =>
  formatIngredient({ ...displayAmount(i.quantity, i.unit), name: i.name, note: null });

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
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const titles = useMemo(() => new Map((recipes.data ?? []).map((r) => [r.id, r.title])), [recipes.data]);
  const items = useMemo(() => list.data ?? [], [list.data]);
  const groups = useMemo(() => {
    const map = new Map<string, ShoppingItem[]>();
    for (const i of items) map.set(i.aisle, [...(map.get(i.aisle) ?? []), i]);
    const order = (a: string) => (AISLE_ORDER.includes(a) ? AISLE_ORDER.indexOf(a) : AISLE_ORDER.length);
    return [...map.entries()]
      .sort(([a], [b]) => order(a) - order(b))
      .map(([aisle, list]) => [aisle, [...list].sort((x, y) => Number(x.checked) - Number(y.checked))] as const);
  }, [items]);

  const done = items.filter((i) => i.checked).length;
  const meals = plan.data?.length ?? 0;
  const hasGenerated = items.some((i) => !i.is_manual);

  const goWeek = (delta: number) => {
    setMessage(null);
    setMonday(addDays(monday, delta * 7));
  };
  const runGenerate = () => {
    setMessage(null);
    generate.mutate(items, { onSuccess: (r) => setMessage(t('shopping.generated', { count: r.items })) });
  };
  const addManual = () => {
    const names = splitPantryInput(draft).slice(0, 30);
    if (!names.length) return;
    addItems.mutate({ names, position: items.length + 1000 }, { onSuccess: () => setDraft('') });
  };
  const share = async () => {
    const text = listAsText(t('shopping.shareTitle', { week: weekLabel(monday) }), items, aisleLabel, formatItem);
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

  let body;
  if (list.isPending || plan.isPending) body = <LoadingState />;
  else if (list.isError) body = <ErrorState message={errorMessage(list.error, t)} onRetry={() => list.refetch()} />;
  else if (plan.isError) body = <ErrorState message={errorMessage(plan.error, t)} onRetry={() => plan.refetch()} />;
  else {
    body = (
      <View style={styles.content}>
        {!items.length ? (
          <EmptyState
            icon={<Icon name={{ ios: 'cart', android: 'shopping_cart' }} size={32} color={colors.primary} />}
            title={t('shopping.emptyTitle')}
            body={meals ? t('shopping.emptyBody') : t('shopping.noMeals')}
            action={
              meals ? (
                <Button label={t('shopping.generate')} onPress={runGenerate} loading={generate.isPending} />
              ) : (
                <Button label={t('shopping.openPlanner')} variant="secondary" onPress={() => router.push('/planner')} />
              )
            }
          />
        ) : (
          <>
            <View style={styles.progressRow}>
              <AppText variant="bodyStrong">
                {done === items.length ? t('shopping.allDone') : t('shopping.progress', { done, total: items.length })}
              </AppText>
            </View>
            <View style={[styles.bar, { backgroundColor: colors.surfaceMuted }]}>
              <View style={[styles.barFill, { backgroundColor: colors.primary, width: `${(done / items.length) * 100}%` }]} />
            </View>
            {groups.map(([aisle, list]) => (
              <View key={aisle} style={styles.group}>
                <AppText variant="caption" tone="secondary" style={styles.aisle}>
                  {aisleLabel(aisle)}
                </AppText>
                {list.map((item) => (
                  <ItemRow key={item.id} item={item} monday={monday} titles={titles} />
                ))}
              </View>
            ))}
          </>
        )}

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
            <Button label={t('shopping.add')} variant="secondary" onPress={addManual} disabled={!draft.trim()} loading={addItems.isPending} />
          </View>
        </View>

        {items.length ? (
          <View style={styles.actions}>
            <Button label={t('shopping.share')} onPress={share} />
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
            {done ? (
              <Button label={t('shopping.clearChecked')} variant="ghost" onPress={() => clearChecked.mutate()} loading={clearChecked.isPending} />
            ) : null}
          </View>
        ) : null}
        {message ? <AppText tone="secondary">{message}</AppText> : null}
        <InlineError
          message={
            generate.isError
              ? errorMessage(generate.error, t)
              : addItems.isError
                ? errorMessage(addItems.error, t)
                : clearChecked.isError
                  ? errorMessage(clearChecked.error, t)
                  : null
          }
        />
      </View>
    );
  }

  return (
    <Screen>
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
      {item.is_manual ? (
        <Pressable onPress={() => remove.mutate(item.id)} accessibilityRole="button" accessibilityLabel={t('shopping.remove')} hitSlop={8}>
          <AppText variant="bodyStrong" tone="secondary">
            ✕
          </AppText>
        </Pressable>
      ) : null}
    </View>
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
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: 56 },
  box: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  addButton: { marginTop: 22 },
  actions: { gap: spacing.sm },
  flex: { flex: 1, gap: 2 },
});
