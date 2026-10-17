import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { PersonCard } from '@/features/social/network';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from '../AppText';
import { Avatar } from '../Avatar';
import { PressableScale } from '../Motion';
import { FollowButton } from './FollowButton';

/** Riga di una persona (ricerca, richieste): foto, @username, nome e pulsante Segui. */
export function PersonRow({ person: p, right }: { person: PersonCard; right?: React.ReactNode }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/u/[id]', params: { id: p.id } })}
      accessibilityRole="button"
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Avatar url={p.avatar_url} name={p.display_name ?? p.username} size={48} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          @{p.username}
          {p.is_friend ? ` · ${t('social.friendBadge')}` : ''}
        </AppText>
        {p.display_name ? (
          <AppText variant="caption" tone="secondary" numberOfLines={1}>
            {p.display_name}
            {p.is_public ? '' : ` · 🔒`}
          </AppText>
        ) : null}
      </View>
      {right ?? <FollowButton userId={p.id} following={p.following} isPublic={p.is_public} />}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1 },
  flex: { flex: 1, gap: 2 },
});
