import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { FadeIn } from '@/components/Motion';
import { Screen } from '@/components/Screen';
import { SearchBar } from '@/components/SearchBar';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { PersonRow } from '@/components/social/PersonRow';
import { useSearchPeople } from '@/features/social/network';
import { errorMessage } from '@/lib/errors';
import { spacing } from '@/theme';

/** Cerca persone per @username o nome. */
export default function SearchScreen() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const results = useSearchPeople(debounced);
  const short = debounced.trim().replace(/^@/, '').length < 2;

  return (
    <Screen scroll>
      <View style={styles.container}>
        <BackButton />
        <AppText variant="title">{t('social.searchTitle')}</AppText>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder={t('social.searchPlaceholder')}
          label={t('social.searchTitle')}
          clearLabel={t('library.clearSearch')}
          autoFocus
        />
        {short ? (
          <AppText tone="secondary">{t('social.searchHint')}</AppText>
        ) : results.isPending ? (
          <LoadingState />
        ) : results.isError ? (
          <ErrorState message={errorMessage(results.error, t)} onRetry={() => results.refetch()} />
        ) : results.data.length ? (
          results.data.map((p, i) => (
            <FadeIn key={p.id} index={i}>
              <PersonRow person={p} />
            </FadeIn>
          ))
        ) : (
          <AppText tone="secondary">{t('social.noResults')}</AppText>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, paddingBottom: spacing.xl },
});
