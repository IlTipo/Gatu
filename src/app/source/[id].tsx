import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Notice } from '@/components/Notice';
import { PlatformBadge } from '@/components/PlatformBadge';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { ErrorState, InlineError, LoadingState } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { formatMinutes } from '@/features/recipes/format';
import { useDeleteSource, useReanalyze, useSource, useSourceResults } from '@/features/sources/api';
import { displayHost } from '@/features/sources/helpers';
import { analysisMessageKey, describeStatus } from '@/features/sources/status';
import type { Source } from '@/features/sources/types';
import { confirm } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';
import { openExternalUrl } from '@/lib/openUrl';
import { radius, spacing, useTheme } from '@/theme';

export default function SourceScreen() {
  const { t } = useTranslation();
  const { id, duplicate, notice } = useLocalSearchParams<{ id: string; duplicate?: string; notice?: string }>();
  const source = useSource(id);

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
        <BackButton />
        <ErrorState message={errorMessage(source.error, t)} onRetry={() => source.refetch()} />
      </Screen>
    );
  }
  return <SourceDetails source={source.data} duplicate={duplicate === '1'} initialNotice={notice ?? null} />;
}

function SourceDetails({ source: s, duplicate, initialNotice }: { source: Source; duplicate: boolean; initialNotice: string | null }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const results = useSourceResults(s.id);
  const reanalyze = useReanalyze();
  const remove = useDeleteSource();
  const [caption, setCaption] = useState(s.shared_text ?? '');
  // messaggio dell'ultima analisi (es. "limite giornaliero raggiunto")
  const [lastNotice, setLastNotice] = useState<string | null>(initialNotice);

  const state = describeStatus(s);
  const title = s.title || displayHost(s.url) || t('source.noTitle');
  const savedOn = new Date(s.created_at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' });
  const busy = reanalyze.isPending || s.status === 'processing';

  function runAnalysis(withText: boolean) {
    setLastNotice(null);
    reanalyze.mutate(
      { sourceId: s.id, ...(withText && caption.trim() ? { text: caption.trim() } : {}) },
      { onSuccess: (result) => setLastNotice(analysisMessageKey(result.analysis)) },
    );
  }

  async function onReanalyze() {
    const ok = await confirm(t('source.reanalyzeConfirm'), { ok: t('source.reanalyze'), cancel: t('common.cancel') });
    if (ok) runAnalysis(true);
  }

  async function onDelete() {
    const ok = await confirm(t('source.deleteConfirm'), { ok: t('common.delete'), cancel: t('common.cancel') });
    if (ok) remove.mutate(s.id, { onSuccess: () => router.replace('/library') });
  }

  const recipes = results.data?.recipes ?? [];
  const places = results.data?.places ?? [];
  const missing = s.ai_result?.missing_info?.length ? t('source.missing', { list: s.ai_result.missing_info.join(', ') }) : null;

  return (
    <Screen scroll>
      <Stack.Screen options={{ title }} />
      <View style={styles.container}>
        <BackButton />

        {duplicate ? <Notice title={t('add.duplicate')} /> : null}

        <View style={styles.header}>
          {s.thumbnail_url ? (
            <View style={[styles.thumb, { backgroundColor: colors.surfaceMuted }]}>
              <Image source={{ uri: s.thumbnail_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
            </View>
          ) : null}
          <View style={styles.headerText}>
            <PlatformBadge platform={s.platform} />
            <AppText variant="bodyStrong" numberOfLines={3}>
              {title}
            </AppText>
            {s.author_name ? (
              <AppText variant="caption" tone="secondary">
                {t('source.by', { author: s.author_name })}
              </AppText>
            ) : null}
            <AppText variant="caption" tone="secondary">
              {t('source.savedOn', { date: savedOn })} · {displayHost(s.url)}
            </AppText>
          </View>
        </View>

        {/* ---- Stato dell'analisi ---- */}
        {busy ? (
          <Notice title={t('source.statusProcessing')} body={t('add.saving')} icon={<ActivityIndicator color={colors.primary} />} />
        ) : state === 'done' ? (
          <Notice
            tone="success"
            title={recipes.length ? t('source.statusDoneRecipe') : t('source.statusDonePlaces', { count: places.length })}
            body={missing}
          />
        ) : state === 'review' ? (
          <Notice title={t('source.statusReview')} body={[t('source.statusReviewBody'), missing].filter(Boolean).join(' ')} />
        ) : state === 'needs_text' ? (
          <Notice tone="warning" title={t('source.needsTextTitle')} body={t('source.needsTextBody')} />
        ) : state === 'unknown' ? (
          <Notice tone="warning" title={t('source.statusUnknown')} body={t('source.statusUnknownBody')} />
        ) : state === 'error' ? (
          <Notice tone="warning" title={t('source.statusError')} body={t(errorKey(s.error_message))} />
        ) : (
          <Notice
            title={t('source.statusPending')}
            body={t('source.statusPendingBody')}
            icon={<Icon name={{ ios: 'sparkles', android: 'auto_awesome' }} size={22} color={colors.primary} />}
          />
        )}

        {/* il caso "manca il testo" ha già il suo riquadro qui sopra */}
        {lastNotice && !busy && !(state === 'needs_text' && lastNotice === 'source.skipped.needs_text') ? (
          <Notice tone="warning" title={t(lastNotice as never)} />
        ) : null}
        <InlineError message={reanalyze.isError ? errorMessage(reanalyze.error, t) : null} />

        {/* ---- Risultati ---- */}
        {recipes.length || places.length ? (
          <Section title={t('source.results')}>
            {recipes.map((r) => (
              <ResultRow
                key={r.id}
                icon={{ ios: 'fork.knife', android: 'restaurant' }}
                title={r.title}
                subtitle={[formatMinutes(r.total_minutes), r.tags.slice(0, 3).join(' · ')].filter(Boolean).join(' · ')}
                onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: r.id } })}
              />
            ))}
            {places.map((p) => (
              <ResultRow
                key={p.id}
                icon={{ ios: 'mappin.and.ellipse', android: 'place' }}
                title={p.name}
                subtitle={[p.cuisine, p.city].filter(Boolean).join(' · ')}
                onPress={() => router.push({ pathname: '/place/[id]', params: { id: p.id } })}
              />
            ))}
          </Section>
        ) : null}

        {/* ---- Testo del post e (ri)analisi ---- */}
        {state === 'pending' || state === 'needs_text' || state === 'unknown' || state === 'error' ? (
          <View style={styles.form}>
            <TextField
              label={t('source.captionLabel')}
              placeholder={t('source.captionPlaceholder')}
              value={caption}
              onChangeText={setCaption}
              multiline
              style={styles.textArea}
              textAlignVertical="top"
            />
            <Button label={t('source.analyze')} onPress={() => runAnalysis(true)} loading={busy} />
          </View>
        ) : null}

        {s.description ? (
          <Section title={t('source.captionLabel')}>
            <AppText tone="secondary">{s.description}</AppText>
          </Section>
        ) : null}

        <InlineError message={remove.isError ? errorMessage(remove.error, t) : null} />
        <View style={styles.actions}>
          <Button label={t('source.openOriginal')} variant="secondary" onPress={() => openExternalUrl(s.url)} />
          {state === 'done' || state === 'review' ? (
            <Button label={t('source.reanalyze')} variant="secondary" onPress={onReanalyze} disabled={busy} />
          ) : null}
          <Button label={t('common.delete')} variant="ghost" onPress={onDelete} loading={remove.isPending} />
        </View>
      </View>
    </Screen>
  );
}

const KNOWN_ERRORS = ['refusal', 'truncated', 'invalid_output', 'rate_limited', 'overloaded', 'auth', 'api_error', 'save_failed'] as const;

function errorKey(errorMessage: string | null) {
  const reason = errorMessage?.replace(/^ai_/, '') ?? 'api_error';
  const known = KNOWN_ERRORS.find((k) => k === reason) ?? 'api_error';
  return `source.errors.${known}` as const;
}

function ResultRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: { ios: 'fork.knife' | 'mappin.and.ellipse'; android: 'restaurant' | 'place' };
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
      ]}>
      <Icon name={icon} size={24} color={colors.primary} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" tone="secondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <AppText tone="secondary">›</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  header: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  thumb: { width: 96, height: 120, borderRadius: radius.md, overflow: 'hidden' },
  headerText: { flex: 1, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  form: { gap: spacing.md },
  textArea: { minHeight: 110 },
  actions: { gap: spacing.sm },
  flex: { flex: 1 },
});
