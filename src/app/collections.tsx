import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/StateViews';
import { useCollections, useReorderCollections } from '@/features/collections/api';
import { describeRules } from '@/features/collections/rules';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

/** Ordine delle collezioni: frecce su/giù (funzionano uguale col dito, col mouse e con i lettori di schermo). */
export default function CollectionsOrderScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const collections = useCollections();
  const reorder = useReorderCollections();

  let body;
  if (collections.isPending) body = <LoadingState />;
  else if (collections.isError)
    body = <ErrorState message={errorMessage(collections.error, t)} onRetry={() => collections.refetch()} />;
  else if (!collections.data.length) body = <EmptyState title={t('collections.none')} />;
  else {
    const list = collections.data;
    const move = (index: number, delta: -1 | 1) => {
      const ids = list.map((c) => c.id);
      const target = index + delta;
      if (target < 0 || target >= ids.length) return;
      [ids[index], ids[target]] = [ids[target], ids[index]];
      reorder.mutate(ids);
    };
    body = (
      <View style={styles.list}>
        {list.map((c, index) => (
          <View key={c.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable
              style={styles.flex}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/collection/[id]', params: { id: c.id } })}>
              <AppText variant="bodyStrong">
                {c.emoji ?? '📁'} {c.name}
              </AppText>
              {c.rules ? (
                <AppText variant="caption" tone="secondary">
                  ⚡ {describeRules(c.rules)}
                </AppText>
              ) : null}
            </Pressable>
            <Arrow label={t('collections.up')} symbol="↑" disabled={index === 0} onPress={() => move(index, -1)} />
            <Arrow
              label={t('collections.down')}
              symbol="↓"
              disabled={index === list.length - 1}
              onPress={() => move(index, 1)}
            />
          </View>
        ))}
        <InlineError message={reorder.isError ? errorMessage(reorder.error, t) : null} />
      </View>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.container}>
        <BackButton />
        <AppText variant="title">{t('collections.reorderTitle')}</AppText>
        <AppText tone="secondary">{t('collections.reorderHint')}</AppText>
        {body}
      </View>
    </Screen>
  );
}

function Arrow({ label, symbol, disabled, onPress }: { label: string; symbol: string; disabled: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.arrow,
        { borderColor: colors.border, backgroundColor: colors.surfaceMuted, opacity: disabled ? 0.3 : pressed ? 0.6 : 1 },
      ]}>
      <AppText variant="bodyStrong">{symbol}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  flex: { flex: 1, gap: spacing.xs },
  arrow: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
