import { router, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { useCollections, useCreateCollection, useDeleteCollection, useUpdateCollection } from '@/features/collections/api';
import { applyRules, cleanRules, type CollectionRules, KCAL_CHOICES, MINUTE_CHOICES } from '@/features/collections/rules';
import { type Collection, COLLECTION_EMOJIS } from '@/features/collections/types';
import { useLibraryPlaces, useLibraryRecipes } from '@/features/library/api';
import { cityCounts } from '@/features/library/filter';
import { RECIPE_TAGS } from '@/features/recipes/constants';
import { confirm } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';
import { spacing } from '@/theme';

/** Crea (id = "new") o modifica una collezione. */
export default function CollectionScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const collections = useCollections();

  if (collections.isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  if (collections.isError) {
    return (
      <Screen>
        <BackButton />
        <ErrorState message={errorMessage(collections.error, t)} onRetry={() => collections.refetch()} />
      </Screen>
    );
  }
  if (id === 'new') return <CollectionForm position={collections.data.length} />;
  const existing = collections.data.find((c) => c.id === id);
  if (!existing) {
    return (
      <Screen>
        <BackButton />
        <ErrorState message={t('errors.notFound')} />
      </Screen>
    );
  }
  return <CollectionForm existing={existing} position={existing.position} />;
}

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/library');
}

function CollectionForm({ existing, position }: { existing?: Collection; position: number }) {
  const { t } = useTranslation();
  const [name, setName] = useState(existing?.name ?? '');
  const [emoji, setEmoji] = useState<string>(existing?.emoji ?? COLLECTION_EMOJIS[0]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [automatic, setAutomatic] = useState(!!existing?.rules);
  const [rules, setRules] = useState<CollectionRules>(existing?.rules ?? {});
  const [rulesError, setRulesError] = useState<string | null>(null);
  const recipes = useLibraryRecipes();
  const places = useLibraryPlaces();
  const cleaned = useMemo(() => cleanRules(rules), [rules]);
  const preview = useMemo(
    () => (cleaned ? applyRules(cleaned, recipes.data ?? [], places.data ?? []) : null),
    [cleaned, recipes.data, places.data],
  );
  const cities = useMemo(() => cityCounts(places.data ?? []).slice(0, 8), [places.data]);
  const patch = (p: Partial<CollectionRules>) => {
    setRules((old) => ({ ...old, ...p }));
    setRulesError(null);
  };
  const create = useCreateCollection();
  const update = useUpdateCollection(existing?.id ?? '');
  const remove = useDeleteCollection(existing?.id ?? '');
  const saving = create.isPending || update.isPending;
  const failure = create.error ?? update.error ?? remove.error;

  function save() {
    if (!name.trim()) {
      setNameError(t('collections.nameRequired'));
      return;
    }
    if (automatic && !cleaned) {
      setRulesError(t('collections.rulesRequired'));
      return;
    }
    const draft = { name: name.trim().slice(0, 60), emoji, rules: automatic ? cleaned : null };
    if (existing) update.mutate(draft, { onSuccess: close });
    else create.mutate({ draft, position }, { onSuccess: close });
  }

  async function del() {
    if (!existing) return;
    const ok = await confirm(t('collections.deleteConfirm', { name: existing.name }), {
      ok: t('common.delete'),
      cancel: t('common.cancel'),
    });
    if (ok) remove.mutate(undefined, { onSuccess: close });
  }

  return (
    <Screen scroll>
      <View style={styles.container}>
        <BackButton />
        <AppText variant="title">{existing ? t('collections.editTitle') : t('collections.newTitle')}</AppText>
        <TextField
          label={t('collections.name')}
          value={name}
          onChangeText={(v) => {
            setName(v);
            if (nameError) setNameError(null);
          }}
          placeholder={t('collections.namePlaceholder')}
          error={nameError}
          maxLength={60}
          autoFocus={!existing}
          returnKeyType="done"
          onSubmitEditing={save}
        />
        <View style={styles.block}>
          <AppText variant="caption" tone="secondary">
            {t('collections.emoji')}
          </AppText>
          <View style={styles.chips}>
            {COLLECTION_EMOJIS.map((e) => (
              <Chip key={e} label={e} selected={emoji === e} onPress={() => setEmoji(e)} />
            ))}
          </View>
        </View>
        <View style={styles.chips}>
          <Chip label={t('collections.manual')} selected={!automatic} onPress={() => setAutomatic(false)} />
          <Chip label={t('collections.automatic')} selected={automatic} onPress={() => setAutomatic(true)} />
        </View>

        {automatic ? (
          <View style={styles.rules}>
            <AppText tone="secondary">{t('collections.automaticHint')}</AppText>
            <RuleBlock label={t('collections.rulesTags')}>
              {RECIPE_TAGS.map((tag) => {
                const on = rules.tags?.includes(tag) ?? false;
                return (
                  <Chip
                    key={tag}
                    label={tag}
                    selected={on}
                    onPress={() => patch({ tags: on ? rules.tags!.filter((x) => x !== tag) : [...(rules.tags ?? []), tag] })}
                  />
                );
              })}
            </RuleBlock>
            <RuleBlock label={t('collections.rulesTime')}>
              <Chip label={t('collections.any')} selected={!rules.max_minutes} onPress={() => patch({ max_minutes: null })} />
              {MINUTE_CHOICES.map((m) => (
                <Chip key={m} label={`≤ ${m} min`} selected={rules.max_minutes === m} onPress={() => patch({ max_minutes: m })} />
              ))}
            </RuleBlock>
            <RuleBlock label={t('collections.rulesKcal')}>
              <Chip label={t('collections.any')} selected={!rules.max_kcal} onPress={() => patch({ max_kcal: null })} />
              {KCAL_CHOICES.map((k) => (
                <Chip key={k} label={`≤ ${k} kcal`} selected={rules.max_kcal === k} onPress={() => patch({ max_kcal: k })} />
              ))}
            </RuleBlock>
            <RuleBlock label={t('collections.rulesDifficulty')}>
              <Chip label={t('collections.any')} selected={!rules.difficulty} onPress={() => patch({ difficulty: null })} />
              {(['facile', 'media', 'difficile'] as const).map((d) => (
                <Chip
                  key={d}
                  label={t(`recipe.difficultyLevel.${d}`)}
                  selected={rules.difficulty === d}
                  onPress={() => patch({ difficulty: d })}
                />
              ))}
            </RuleBlock>
            <TextField
              label={t('collections.rulesCity')}
              value={rules.city ?? ''}
              onChangeText={(v) => patch({ city: v })}
              placeholder={t('collections.rulesCityPlaceholder')}
              maxLength={60}
            />
            {cities.length ? (
              <View style={styles.chips}>
                {cities.map(({ value }) => (
                  <Chip
                    key={value}
                    label={value}
                    selected={rules.city === value}
                    onPress={() => patch({ city: rules.city === value ? null : value })}
                  />
                ))}
              </View>
            ) : null}
            <View style={styles.chips}>
              <Chip
                label={`❤️ ${t('collections.rulesWishlist')}`}
                selected={!!rules.wishlist}
                onPress={() => patch({ wishlist: !rules.wishlist })}
              />
            </View>
            {preview ? (
              <AppText variant="bodyStrong" tone="primary">
                {t('collections.autoItems', { count: preview.recipeIds.length + preview.placeIds.length })}
              </AppText>
            ) : null}
            <InlineError message={rulesError} />
          </View>
        ) : existing ? (
          <AppText tone="secondary">
            {t('collections.items', { count: existing.recipeIds.length + existing.placeIds.length })}
          </AppText>
        ) : null}
        <InlineError message={failure ? errorMessage(failure, t) : null} />
        <Button label={existing ? t('common.save') : t('collections.create')} onPress={save} loading={saving} />
        {existing ? (
          <Button label={t('collections.deleteButton')} variant="ghost" onPress={del} loading={remove.isPending} />
        ) : null}
      </View>
    </Screen>
  );
}

function RuleBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.block}>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  rules: { gap: spacing.lg },
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  block: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
