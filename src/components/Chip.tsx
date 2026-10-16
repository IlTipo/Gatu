import { Pressable, StyleSheet } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';

/** Etichetta arrotondata; se ha onPress diventa selezionabile (es. tag nei filtri). */
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'checkbox' : 'text'}
      accessibilityState={onPress ? { checked: !!selected } : undefined}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.surfaceMuted,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}>
      <AppText variant="caption" style={{ color: selected ? colors.onPrimary : colors.text, fontWeight: '600' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1 },
});
