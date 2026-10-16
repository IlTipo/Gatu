import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { useTheme } from '@/theme';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

type Props = {
  /** Nome dell'icona: `ios` usa SF Symbols, `android` usa Material Symbols. */
  name: Extract<SymbolName, object>;
  size?: number;
  color?: ColorValue;
};

export function Icon({ name, size = 24, color }: Props) {
  const { colors } = useTheme();
  return <SymbolView name={{ ...name, web: name.android }} size={size} tintColor={color ?? colors.text} />;
}
