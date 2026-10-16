import { useTranslation } from 'react-i18next';

import { PlaceholderTab } from '@/components/PlaceholderTab';

export default function ShoppingScreen() {
  const { t } = useTranslation();
  return (
    <PlaceholderTab
      title={t('shopping.title')}
      emptyTitle={t('shopping.emptyTitle')}
      emptyBody={t('shopping.emptyBody')}
      icon={{ ios: 'cart', android: 'shopping_cart' }}
    />
  );
}
