import { StyleSheet, View } from 'react-native';

import { PLATFORM_LABELS } from '@/features/sources/helpers';
import type { Platform } from '@/features/sources/types';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';

export function PlatformBadge({ platform }: { platform: Platform }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: colors.surfaceMuted }]}>
      <AppText variant="caption" style={{ color: colors.text, fontWeight: '600' }}>
        {PLATFORM_LABELS[platform]}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
});
