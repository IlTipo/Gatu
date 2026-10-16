import { Text, type TextProps } from 'react-native';

import { typography, useTheme, type TypographyVariant } from '@/theme';

type Props = TextProps & {
  variant?: TypographyVariant;
  tone?: 'default' | 'secondary' | 'primary' | 'danger' | 'onPrimary';
};

export function AppText({ variant = 'body', tone = 'default', style, ...rest }: Props) {
  const { colors } = useTheme();
  const color = {
    default: colors.text,
    secondary: colors.textSecondary,
    primary: colors.primary,
    danger: colors.danger,
    onPrimary: colors.onPrimary,
  }[tone];
  return <Text style={[typography[variant], { color }, style]} {...rest} />;
}
