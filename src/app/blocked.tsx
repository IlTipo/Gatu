import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { PersonRow } from '@/components/social/PersonRow';
import { useBlock, useMyBlocks } from '@/features/social/network';
import { errorMessage } from '@/lib/errors';
import { spacing } from '@/theme';

/** Persone bloccate: da qui si possono sbloccare. */
export default function BlockedScreen() {
  const { t } = useTranslation();
  const list = useMyBlocks();
  const block = useBlock();
  let body;
  if (list.isPending) body = <LoadingState />;
  else if (list.isError) body = <ErrorState message={errorMessage(list.error, t)} onRetry={() => list.refetch()} />;
  else if (!list.data.length) body = <EmptyState title={t('block.none')} body={t('block.noneBody')} />;
  else
    body = list.data.map((p) => (
      <PersonRow
        key={p.id}
        person={{ ...p, is_public: false, following: 'none', is_friend: false, blocked: true }}
        right={
          <Button
            label={t('block.unblock')}
            variant="secondary"
            onPress={() => block.mutate({ userId: p.id, block: false })}
            loading={block.isPending && block.variables?.userId === p.id}
          />
        }
      />
    ));
  return (
    <Screen scroll>
      <View style={styles.container}>
        <BackButton fallback="/profile" />
        <AppText variant="title">{t('block.title')}</AppText>
        {body}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ container: { gap: spacing.md } });
