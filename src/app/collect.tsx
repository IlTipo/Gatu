import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { useCollections, useCreateCollection, useToggleCollectionItem } from '@/features/collections/api';
import type { CollectionTarget } from '@/features/collections/types';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

/** Mette una ricetta o un posto in una o più collezioni: /collect?recipeId=… oppure ?placeId=… */
export default function CollectScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ recipeId?: string; placeId?: string }>();
  const target: CollectionTarget | null = params.recipeId
    ? { recipeId: params.recipeId }
    : params.placeId
      ? { placeId: params.placeId }
      : null;
  const collections = useCollections();
  const toggle = useToggleCollectionItem();
  const create = useCreateCollection();
  const [pending, setPending] = useState<string | null>(null);
  const [name, setName] = useState('');

  const close = () => (router.canGoBack() ? router.back() : router.replace('/library'));

  let body;
  if (!target) {
    body = <ErrorState message={t('errors.notFound')} />;
  } else if (collections.isPending) {
    body = <LoadingState />;
  } else if (collections.isError) {
    body = <ErrorState message={errorMessage(collections.error, t)} onRetry={() => collections.refetch()} />;
  } else {
    // le automatiche si riempiono da sole
    const list = collections.data.filter((c) => !c.rules);
    const hasAutomatic = list.length < collections.data.length;
    const contains = (c: (typeof list)[number]) =>
      'recipeId' in target ? c.recipeIds.includes(target.recipeId) : c.placeIds.includes(target.placeId);

    const onToggle = (collectionId: string, add: boolean) => {
      setPending(collectionId);
      toggle.mutate({ collectionId, target, add }, { onSettled: () => setPending(null) });
    };
    const quickCreate = () => {
      if (!name.trim()) return;
      create.mutate(
        { draft: { name: name.trim().slice(0, 60), emoji: '📁' }, target, position: collections.data.length },
        { onSuccess: () => setName('') },
      );
    };

    body = (
      <View style={styles.container}>
        <AppText tone="secondary">{list.length ? t('collections.pickHint') : t('collections.none')}</AppText>
        {list.map((c) => {
          const checked = contains(c);
          return (
            <Pressable
              key={c.id}
              onPress={() => onToggle(c.id, !checked)}
              disabled={pending === c.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={c.name}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: checked ? colors.surfaceMuted : colors.surface,
                  borderColor: checked ? colors.primary : colors.border,
                  opacity: pressed || pending === c.id ? 0.6 : 1,
                },
              ]}>
              <AppText variant="heading">{c.emoji ?? '📁'}</AppText>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{c.name}</AppText>
                <AppText variant="caption" tone="secondary">
                  {t('collections.items', { count: c.recipeIds.length + c.placeIds.length })}
                </AppText>
              </View>
              <View
                style={[
                  styles.check,
                  { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : 'transparent' },
                ]}>
                {checked ? (
                  <AppText variant="caption" tone="onPrimary">
                    ✓
                  </AppText>
                ) : null}
              </View>
            </Pressable>
          );
        })}
        <InlineError message={toggle.isError ? errorMessage(toggle.error, t) : null} />
        {hasAutomatic ? (
          <AppText variant="caption" tone="secondary">
            {t('collections.autoNotPickable')}
          </AppText>
        ) : null}

        <View style={styles.create}>
          <View style={styles.flex}>
            <TextField
              label={t('collections.newTitle')}
              value={name}
              onChangeText={setName}
              placeholder={t('collections.namePlaceholder')}
              maxLength={60}
              returnKeyType="done"
              onSubmitEditing={quickCreate}
            />
          </View>
          <View style={styles.createButton}>
            <Button
              label={t('collections.quickCreate')}
              variant="secondary"
              onPress={quickCreate}
              loading={create.isPending}
              disabled={!name.trim()}
            />
          </View>
        </View>
        <InlineError message={create.isError ? errorMessage(create.error, t) : null} />

        <Button label={t('collections.done')} onPress={close} />
      </View>
    );
  }

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <AppText variant="heading" style={styles.title}>
        {t('collections.pickTitle')}
      </AppText>
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.md },
  container: { gap: spacing.md, paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  create: { gap: spacing.sm, marginTop: spacing.sm },
  createButton: { alignSelf: 'flex-start' },
  flex: { flex: 1, gap: spacing.xs },
});
