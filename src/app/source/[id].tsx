import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { PlatformBadge } from '@/components/PlatformBadge';
import { Screen } from '@/components/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/StateViews';
import { useDeleteSource, useSource } from '@/features/sources/api';
import { displayHost } from '@/features/sources/helpers';
import { confirm } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';
import { openExternalUrl } from '@/lib/openUrl';
import { radius, spacing, useTheme } from '@/theme';

export default function SourceScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { id, needsText, duplicate } = useLocalSearchParams<{ id: string; needsText?: string; duplicate?: string }>();
  const source = useSource(id);
  const remove = useDeleteSource();

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/library'));

  async function onDelete() {
    const ok = await confirm(t('source.deleteConfirm'), { ok: t('common.delete'), cancel: t('common.cancel') });
    if (!ok) return;
    remove.mutate(id, { onSuccess: () => router.replace('/library') });
  }

  if (source.isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  if (source.isError) {
    return (
      <Screen>
        <ErrorState message={errorMessage(source.error, t)} onRetry={() => source.refetch()} />
        <Button label={t('common.back')} variant="ghost" onPress={goBack} />
      </Screen>
    );
  }

  const s = source.data;
  const title = s.title || displayHost(s.url) || t('source.noTitle');
  const savedOn = new Date(s.created_at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <Screen scroll>
      <Stack.Screen options={{ title }} />
      <View style={styles.container}>
        <Button label={`‹ ${t('common.back')}`} variant="ghost" onPress={goBack} />

        {duplicate === '1' ? (
          <View style={[styles.notice, { backgroundColor: colors.surfaceMuted }]}>
            <AppText>{t('add.duplicate')}</AppText>
          </View>
        ) : null}

        {s.thumbnail_url ? (
          <View style={[styles.imageWrap, { backgroundColor: colors.surfaceMuted }]}>
            <Image source={{ uri: s.thumbnail_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          </View>
        ) : null}

        <View style={styles.titleBlock}>
          <PlatformBadge platform={s.platform} />
          <AppText variant="heading">{title}</AppText>
          {s.author_name ? <AppText tone="secondary">{t('source.by', { author: s.author_name })}</AppText> : null}
          <AppText variant="caption" tone="secondary">
            {t('source.savedOn', { date: savedOn })} · {displayHost(s.url)}
          </AppText>
        </View>

        <View style={[styles.notice, { backgroundColor: colors.surfaceMuted }]}>
          <Icon name={{ ios: 'sparkles', android: 'auto_awesome' }} size={22} color={colors.primary} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{t('source.statusPending')}</AppText>
            <AppText tone="secondary">{t('source.statusPendingBody')}</AppText>
          </View>
        </View>

        {needsText === '1' || (!s.description && !s.shared_text) ? (
          <View style={[styles.notice, { backgroundColor: colors.dangerSurface }]}>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{t('source.needsTextTitle')}</AppText>
              <AppText tone="secondary">{t('source.needsTextBody')}</AppText>
            </View>
          </View>
        ) : null}

        {s.description ? <AppText>{s.description}</AppText> : null}

        {s.shared_text ? (
          <View style={styles.section}>
            <AppText variant="caption" tone="secondary">
              {t('source.sharedText')}
            </AppText>
            <AppText>{s.shared_text}</AppText>
          </View>
        ) : null}

        <InlineError message={remove.isError ? errorMessage(remove.error, t) : null} />
        <Button label={t('source.openOriginal')} onPress={() => openExternalUrl(s.url)} />
        <Button label={t('common.delete')} variant="secondary" onPress={onDelete} loading={remove.isPending} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  imageWrap: { width: '100%', aspectRatio: 4 / 3, maxHeight: 420, borderRadius: radius.lg, overflow: 'hidden' },
  titleBlock: { gap: spacing.xs },
  notice: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, alignItems: 'flex-start' },
  section: { gap: spacing.xs },
  flex: { flex: 1 },
});
