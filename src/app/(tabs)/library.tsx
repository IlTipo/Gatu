import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { SourceCard } from '@/components/SourceCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { useSources } from '@/features/sources/api';
import { errorMessage } from '@/lib/errors';
import { spacing, useTheme } from '@/theme';

export default function LibraryScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const sources = useSources();
  const columns = width >= 700 ? 3 : 2;
  const goToAdd = () => router.push('/add');

  let content;
  if (sources.isPending) {
    content = <LoadingState />;
  } else if (sources.isError) {
    content = <ErrorState message={errorMessage(sources.error, t)} onRetry={() => sources.refetch()} />;
  } else if (sources.data.length === 0) {
    content = (
      <EmptyState
        icon={<Icon name={{ ios: 'book', android: 'menu_book' }} size={32} color={colors.primary} />}
        title={t('library.emptyTitle')}
        body={t('library.emptyBody')}
        action={<Button label={t('library.emptyAction')} onPress={goToAdd} />}
      />
    );
  } else {
    content = (
      <FlatList
        key={columns} // cambiando il numero di colonne la lista va ricreata
        data={sources.data}
        keyExtractor={(item) => item.id}
        numColumns={columns}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        refreshing={sources.isRefetching}
        onRefresh={() => sources.refetch()}
        ListHeaderComponent={
          <AppText variant="caption" tone="secondary" style={styles.sectionTitle}>
            {t('library.recentTitle')}
          </AppText>
        }
        renderItem={({ item }) => (
          <View style={{ flex: 1 / columns }}>
            <SourceCard source={item} onPress={() => router.push({ pathname: '/source/[id]', params: { id: item.id } })} />
          </View>
        )}
      />
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">{t('library.title')}</AppText>
        <Button
          label={t('library.add')}
          onPress={goToAdd}
          icon={<Icon name={{ ios: 'plus', android: 'add' }} size={20} color={colors.onPrimary} />}
        />
      </View>
      {content}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  list: { gap: spacing.md, paddingBottom: spacing.xl },
  row: { gap: spacing.md },
  sectionTitle: { textTransform: 'uppercase', letterSpacing: 0.6 },
});
