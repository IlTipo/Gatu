import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { radius, spacing, typography, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

/** Campo di ricerca compatto con lente e "×" per cancellare. */
export function SearchBar({
  value,
  onChangeText,
  placeholder,
  label,
  clearLabel,
  autoFocus,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  label: string;
  clearLabel: string;
  autoFocus?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Icon name={{ ios: 'magnifyingglass', android: 'search' }} size={20} color={colors.textSecondary} />
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        inputMode="search"
        autoFocus={autoFocus}
        style={[styles.input, typography.body, { color: colors.text }]}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} accessibilityRole="button" accessibilityLabel={clearLabel} hitSlop={8}>
          <AppText variant="bodyStrong" tone="secondary">
            ×
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.pill,
  },
  input: { flex: 1, paddingVertical: spacing.sm, minWidth: 0 },
});
