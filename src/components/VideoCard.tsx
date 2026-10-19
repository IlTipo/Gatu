import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useRecipeFromVideo, type VideoResult } from '@/features/recipes/api';
import { errorMessage } from '@/lib/errors';
import { pickVideo, uploadVideo } from '@/lib/video';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { InlineError } from './StateViews';

/**
 * "Procedimento dal video": in evidenza se la ricetta non ha passaggi, altrimenti un pulsante discreto.
 * Il video si carica nella cartella privata dell'utente; il server lo fa leggere all'AI e poi lo cancella.
 */
export function VideoCard({ recipeId, hasSteps }: { recipeId: string; hasSteps: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const read = useRecipeFromVideo(recipeId);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'reading'>('idle');
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function start() {
    setError(null);
    setMessage(null);
    try {
      const video = await pickVideo();
      if (!video) return;
      setPhase('uploading');
      const videoPath = await uploadVideo(video);
      setPhase('reading');
      const res = await read.mutateAsync({ videoPath });
      setMessage(describe(res, t));
    } catch (e) {
      setError(e);
    } finally {
      setPhase('idle');
    }
  }

  const busy = phase !== 'idle';
  const label = phase === 'uploading' ? t('video.uploading') : phase === 'reading' ? t('video.reading') : hasSteps ? t('video.again') : t('video.button');

  return (
    <View
      style={[
        styles.card,
        hasSteps ? { borderColor: colors.border } : { borderColor: colors.primary, backgroundColor: colors.surface },
      ]}>
      {!hasSteps ? (
        <>
          <AppText variant="bodyStrong">{t('video.missingTitle')}</AppText>
          <AppText tone="secondary">{t('video.missingBody')}</AppText>
        </>
      ) : (
        <AppText variant="caption" tone="secondary">
          {t('video.againHint')}
        </AppText>
      )}
      <Button label={label} variant={hasSteps ? 'secondary' : 'primary'} onPress={start} loading={busy} disabled={busy} />
      <AppText variant="caption" tone="secondary">
        {t('video.privacy')}
      </AppText>
      {message ? <AppText variant="bodyStrong">{message}</AppText> : null}
      <InlineError message={error ? errorMessage(error, t) : null} />
    </View>
  );
}

function describe(res: VideoResult, t: TFunction): string {
  if (res.status === 'done') {
    if (res.changed.includes('steps') && res.changed.includes('ingredients')) return t('video.done_both');
    if (res.changed.includes('steps')) return t('video.done_steps');
    return t('video.done_none');
  }
  if (res.status === 'skipped') return t(`recipe.aiSkipped.${res.reason}`);
  if (res.reason === 'no_recipe') return t('video.no_recipe');
  if (res.reason === 'invalid_video') return t('errors.invalidVideo');
  if (res.reason === 'rate_limited') return t('recipe.aiRateLimited');
  if (res.reason === 'overloaded') return t('recipe.aiBusy');
  return t('recipe.aiError');
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
});
