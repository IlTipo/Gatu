import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { useLibraryRecipes } from '@/features/library/api';
import { matchPantry, splitPantryInput } from '@/features/library/pantry';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

// Gli ingredienti restano finché l'app è aperta (tornando qui li ritrovi).
let remembered: string[] = [];

export default function PantryScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const recipes = useLibraryRecipes();
  const [items, setItemsState] = useState<string[]>(remembered);
  const [draft, setDraft] = useState('');

  const setItems = (next: string[]) => {
    remembered = next;
    setItemsState(next);
  };
  const add = () => {
    const parts = splitPantryInput(draft);
    if (!parts.length) return;
    setItems([...new Set([...items, ...parts])].slice(0, 40));
    setDraft('');
  };

  const matches = useMemo(() => matchPantry(recipes.data ?? [], items), [recipes.data, items]);

  let body;
  if (recipes.isPending) body = <LoadingState />;
  else if (recipes.isError) body = <ErrorState message={errorMessage(recipes.error, t)} onRetry={() => recipes.refetch()} />;
  else if (!items.length) body = <AppText tone="secondary">{t('pantry.empty')}</AppText>;
  else if (!matches.length) body = <EmptyState title={t('pantry.noMatch')} />;
  else
    body = (
      <View style={styles.results}>
        {matches.slice(0, 50).map((m) => (
          <Pressable
            key={m.recipe.id}
            accessibilityRole="button"
            accessibilityLabel={m.recipe.title}
            onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: m.recipe.id } })}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: colors.surface,
                borderColor: m.missing.length ? colors.border : colors.success,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <AppText variant="bodyStrong">{m.recipe.title}</AppText>
            {m.missing.length ? (
              <AppText tone="secondary">
                {t('pantry.missing', { count: m.missing.length, list: m.missing.join(', ') })}
              </AppText>
            ) : (
              <AppText style={{ color: colors.success }}>{t('pantry.all')}</AppText>
            )}
            <AppText variant="caption" tone="secondary">
              {t('pantry.have', { list: m.have.join(', ') })}
            </AppText>
          </Pressable>
        ))}
      </View>
    );

  return (
    <Screen scroll>
      <View style={styles.container}>
        <BackButton />
        <View style={styles.block}>
          <AppText variant="title">{t('pantry.title')}</AppText>
          <AppText tone="secondary">{t('pantry.subtitle')}</AppText>
        </View>
        <View style={styles.inputRow}>
          <View style={styles.flex}>
            <TextField
              label={t('pantry.label')}
              value={draft}
              onChangeText={setDraft}
              placeholder={t('pantry.placeholder')}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={add}
              blurOnSubmit={false}
              autoFocus={!items.length}
            />
          </View>
          <View style={styles.addButton}>
            <Button label={t('pantry.add')} variant="secondary" onPress={add} disabled={!draft.trim()} />
          </View>
        </View>
        <AppText variant="caption" tone="secondary">
          {t('pantry.hint')}
        </AppText>
        {items.length ? (
          <View style={styles.chips}>
            {items.map((item) => (
              <Chip key={item} label={`${item}  ×`} selected onPress={() => setItems(items.filter((x) => x !== item))} />
            ))}
            <Chip label={t('pantry.clear')} onPress={() => setItems([])} />
          </View>
        ) : null}
        {body}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  block: { gap: spacing.xs },
  inputRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  addButton: { marginTop: 22 },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  results: { gap: spacing.md },
  row: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
});
