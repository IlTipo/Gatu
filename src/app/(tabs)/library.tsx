import { useTranslation } from 'react-i18next';

import { PlaceholderTab } from '@/components/PlaceholderTab';

export default function LibraryScreen() {
  const { t } = useTranslation();
  return (
    <PlaceholderTab
      title={t('library.title')}
      emptyTitle={t('library.emptyTitle')}
      emptyBody={t('library.emptyBody')}
      icon={{ ios: 'book', android: 'menu_book' }}
    />
  );
}
