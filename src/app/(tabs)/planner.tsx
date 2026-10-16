import { useTranslation } from 'react-i18next';

import { PlaceholderTab } from '@/components/PlaceholderTab';

export default function PlannerScreen() {
  const { t } = useTranslation();
  return (
    <PlaceholderTab
      title={t('planner.title')}
      emptyTitle={t('planner.emptyTitle')}
      emptyBody={t('planner.emptyBody')}
      icon={{ ios: 'calendar', android: 'calendar_month' }}
    />
  );
}
