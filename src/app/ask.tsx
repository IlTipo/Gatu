import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { type AskItem, useAskLibrary, useLibraryPlaces, useLibraryRecipes } from '@/features/library/api';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

/** "Chiedi all'AI": risposta scelta tra le ricette e i posti salvati. /ask?q=… */
export default function AskScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ q?: string }>();
  const [draft, setDraft] = useState(params.q ?? '');
  const [question, setQuestion] = useState((params.q ?? '').trim());
  const answer = useAskLibrary(question);

  const submit = () => {
    const q = draft.trim().slice(0, 300);
    if (q.length >= 2) setQuestion(q);
  };

  let body;
  if (!question) {
    body = <AppText tone="secondary">{t('ask.hint')}</AppText>;
  } else if (answer.isPending) {
    body = <LoadingState message={t('ask.thinking')} />;
  } else if (answer.isError) {
    body = <ErrorState message={errorMessage(answer.error, t)} onRetry={() => answer.refetch()} />;
  } else {
    const res = answer.data;
    if (res.status === 'empty') body = <EmptyState title={t('ask.empty')} />;
    else if (res.status === 'skipped') body = <EmptyState title={t(`recipe.aiSkipped.${res.reason}`)} />;
    else if (res.status === 'error') body = (
        <ErrorState
          message={res.reason === 'rate_limited' ? t('recipe.aiRateLimited') : res.reason === 'overloaded' ? t('recipe.aiBusy') : t('recipe.aiError')}
          onRetry={() => answer.refetch()}
        />
      );
    else
      body = (
        <View style={styles.results}>
          {res.message ? <AppText variant="bodyStrong">{res.message}</AppText> : null}
          {res.items.length ? (
            res.items.map((item) => <AnswerRow key={`${item.type}-${item.id}`} item={item} />)
          ) : (
            <AppText tone="secondary">{t('ask.noMatch')}</AppText>
          )}
          <AppText variant="caption" tone="secondary">
            {t('ask.hint')}
          </AppText>
        </View>
      );
  }

  return (
    <Screen scroll>
      <View style={styles.container}>
        <BackButton />
        <AppText variant="title">{t('ask.title')}</AppText>
        <TextField
          label={t('ask.title')}
          value={draft}
          onChangeText={setDraft}
          placeholder={t('ask.placeholder')}
          maxLength={300}
          returnKeyType="search"
          onSubmitEditing={submit}
          autoFocus={!params.q}
        />
        <Button label={t('ask.ask')} onPress={submit} disabled={draft.trim().length < 2} loading={answer.isFetching} />
        {body}
      </View>
    </Screen>
  );
}

/** Una ricetta o un posto scelto dall'AI, con il perché. */
function AnswerRow({ item }: { item: AskItem }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const recipes = useLibraryRecipes();
  const places = useLibraryPlaces();
  const title =
    item.type === 'recipe'
      ? recipes.data?.find((r) => r.id === item.id)?.title
      : places.data?.find((p) => p.id === item.id)?.name;
  const loading = item.type === 'recipe' ? recipes.isPending : places.isPending;
  if (!title && !loading) return null; // eliminato nel frattempo

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() =>
        item.type === 'recipe'
          ? router.push({ pathname: '/recipe/[id]', params: { id: item.id } })
          : router.push({ pathname: '/place/[id]', params: { id: item.id } })
      }
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <AppText variant="caption" tone="primary">
        {item.type === 'recipe' ? `🍳 ${t('ask.recipe')}` : `📍 ${t('ask.place')}`}
      </AppText>
      <AppText variant="bodyStrong">{title ?? '…'}</AppText>
      {item.reason ? <AppText tone="secondary">{item.reason}</AppText> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  results: { gap: spacing.md },
  row: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
});
