import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
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
import { type Collection, COLLECTION_EMOJIS } from '@/features/collections/types';
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
    const draft = { name: name.trim().slice(0, 60), emoji };
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
        {existing ? (
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

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  block: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
