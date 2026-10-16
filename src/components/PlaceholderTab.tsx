import type { ComponentProps } from 'react';

import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { Screen } from './Screen';
import { EmptyState } from './StateViews';

type Props = {
  title: string;
  emptyTitle: string;
  emptyBody: string;
  icon: ComponentProps<typeof Icon>['name'];
};

/** Tab ancora vuota: titolo + messaggio "qui arriverà…". Verrà sostituita fase dopo fase. */
export function PlaceholderTab({ title, emptyTitle, emptyBody, icon }: Props) {
  const { colors } = useTheme();
  return (
    <Screen>
      <AppText variant="title">{title}</AppText>
      <EmptyState icon={<Icon name={icon} size={32} color={colors.primary} />} title={emptyTitle} body={emptyBody} />
    </Screen>
  );
}
