import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { collectionsContaining, useCollections } from '@/features/collections/api';
import type { CollectionTarget } from '@/features/collections/types';

import { Button } from './Button';

/** "📁 Aggiungi a una collezione" oppure "📁 In 2 collezioni": apre la scelta delle collezioni. */
export function CollectionButton({ target }: { target: CollectionTarget }) {
  const { t } = useTranslation();
  const collections = useCollections();
  const count = collections.data ? collectionsContaining(collections.data, target).length : 0;
  return (
    <Button
      label={count ? t('collections.inCollections', { count }) : t('collections.add')}
      variant="secondary"
      onPress={() => router.push({ pathname: '/collect', params: target })}
    />
  );
}
