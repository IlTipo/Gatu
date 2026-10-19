import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { DietPlanView } from '@/components/DietPlanView';
import { Screen } from '@/components/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { type DietFile, pickPdf, useDeleteDietPlan, useDietPlan, useReadDietPlan, useSaveDietPlan } from '@/features/diet/api';
import { setDietDraft } from '@/features/diet/draft';
import type { DietPlan } from '@/features/diet/types';
import { confirm } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';
import { pickRecipePhoto } from '@/lib/photo';
import { spacing } from '@/theme';

/** 🥗 Il mio piano alimentare: caricalo (foto, PDF, testo o a mano) e guarda cosa mangiare oggi. */
export default function DietScreen() {
  const { t } = useTranslation();
  const plan = useDietPlan();
  const remove = useDeleteDietPlan();
  const [replacing, setReplacing] = useState(false);

  let body;
  if (plan.isPending) body = <LoadingState />;
  else if (plan.isError) body = <ErrorState message={errorMessage(plan.error, t)} onRetry={() => plan.refetch()} />;
  else if (!plan.data || replacing) body = <LoadPlan onDone={() => setReplacing(false)} onCancel={plan.data ? () => setReplacing(false) : undefined} />;
  else
    body = (
      <>
        {plan.data.title ? <AppText variant="heading">{plan.data.title}</AppText> : null}
        <DietPlanView plan={plan.data} />
        <View style={styles.actions}>
          <Button label={t('diet.edit')} variant="secondary" onPress={() => router.push('/diet/edit')} />
          <Button label={t('diet.replace')} variant="ghost" onPress={() => setReplacing(true)} />
          <Button
            label={t('diet.delete')}
            variant="ghost"
            loading={remove.isPending}
            onPress={async () => {
              if (await confirm(t('diet.deleteConfirm'), { ok: t('diet.delete'), cancel: t('common.cancel') })) remove.mutate();
            }}
          />
        </View>
        <InlineError message={remove.isError ? errorMessage(remove.error, t) : null} />
      </>
    );

  return (
    <Screen scroll>
      <View style={styles.container}>
        <BackButton />
        <AppText variant="title">{t('diet.title')}</AppText>
        {body}
      </View>
    </Screen>
  );
}

/** Caricamento: foto (anche più pagine), PDF o testo → l'AI lo legge → controlli → salvi. */
function LoadPlan({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const { t } = useTranslation();
  const read = useReadDietPlan();
  const save = useSaveDietPlan();
  const [files, setFiles] = useState<DietFile[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<DietPlan | null>(null);

  const addFile = async (kind: 'photo' | 'pdf') => {
    setError(null);
    setMessage(null);
    if (files.length >= 5) return setMessage(t('diet.tooManyFiles'));
    try {
      if (kind === 'pdf') {
        const pdf = await pickPdf();
        if (pdf) setFiles([...files, pdf]);
      } else {
        const photo = await pickRecipePhoto();
        if (photo) {
          const n = files.filter((f) => f.mimeType !== 'application/pdf').length + 1;
          setFiles([...files, { base64: photo.base64, mimeType: photo.mimeType, name: `Foto ${n}`, bytes: (photo.base64.length * 3) / 4 }]);
        }
      }
    } catch (e) {
      setError(e);
    }
  };

  const run = () => {
    setError(null);
    setMessage(null);
    read.mutate(
      { files, text: text.trim() },
      {
        onSuccess: (res) => {
          if (res.status === 'done') setPreview(res.plan);
          else if (res.status === 'not_plan') setMessage(t('diet.notPlan'));
          else if (res.status === 'skipped') setMessage(t(`recipe.aiSkipped.${res.reason}`));
          else setMessage(res.reason === 'rate_limited' ? t('recipe.aiRateLimited') : res.reason === 'overloaded' ? t('recipe.aiBusy') : t('recipe.aiError'));
        },
      },
    );
  };

  if (preview) {
    return (
      <>
        <AppText variant="heading">{t('diet.previewTitle')}</AppText>
        <AppText tone="secondary">{t('diet.previewHint')}</AppText>
        <DietPlanView plan={preview} preview />
        <View style={styles.actions}>
          <Button label={t('diet.save')} onPress={() => save.mutate(preview, { onSuccess: onDone })} loading={save.isPending} />
          <Button
            label={t('diet.fix')}
            variant="secondary"
            onPress={() => {
              setDietDraft(preview);
              router.push('/diet/edit');
              onDone();
            }}
          />
          <Button label={t('diet.discard')} variant="ghost" onPress={() => setPreview(null)} />
        </View>
        <InlineError message={save.isError ? errorMessage(save.error, t) : null} />
      </>
    );
  }

  const canRead = files.length > 0 || text.trim().length >= 20;
  return (
    <>
      <AppText tone="secondary">{t('diet.emptyBody')}</AppText>
      <View style={styles.actions}>
        <Button label={t('diet.addPhoto')} variant="secondary" onPress={() => addFile('photo')} disabled={read.isPending} />
        {Platform.OS === 'web' ? (
          <Button label={t('diet.addPdf')} variant="secondary" onPress={() => addFile('pdf')} disabled={read.isPending} />
        ) : null}
      </View>
      {files.length ? (
        <View style={styles.chips}>
          {files.map((f, i) => (
            <Chip key={`${f.name}-${i}`} label={`${f.mimeType === 'application/pdf' ? '📄' : '📷'} ${f.name} ✕`} onPress={() => setFiles(files.filter((_, k) => k !== i))} />
          ))}
        </View>
      ) : null}
      <TextField label={t('diet.pasteLabel')} value={text} onChangeText={setText} placeholder={t('diet.pastePlaceholder')} multiline maxLength={20000} />
      <Button label={read.isPending ? t('diet.reading') : t('diet.read')} onPress={run} disabled={!canRead} loading={read.isPending} />
      {message ? <AppText tone="secondary">{message}</AppText> : null}
      <InlineError message={error ? errorMessage(error, t) : read.isError ? errorMessage(read.error, t) : null} />
      <Button label={t('diet.manual')} variant="ghost" onPress={() => router.push('/diet/edit')} />
      {onCancel ? <Button label={t('common.cancel')} variant="ghost" onPress={onCancel} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  actions: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
