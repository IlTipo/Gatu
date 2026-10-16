import { useTranslation } from 'react-i18next';

import { PlaceholderTab } from '@/components/PlaceholderTab';

export default function MapScreen() {
  const { t } = useTranslation();
  return (
    <PlaceholderTab
      title={t('map.title')}
      emptyTitle={t('map.emptyTitle')}
      emptyBody={t('map.emptyBody')}
      icon={{ ios: 'map', android: 'map' }}
    />
  );
}
