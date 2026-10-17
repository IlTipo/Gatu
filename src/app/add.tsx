import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { InlineError } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { useSaveLink, useSavePhoto } from '@/features/sources/api';
import { findUrl, readSharedParams } from '@/features/sources/helpers';
import type { SaveLinkResult } from '@/features/sources/types';
import { analysisMessageKey, destinationAfterSave } from '@/features/sources/status';
import { errorMessage } from '@/lib/errors';
import { pickRecipePhoto } from '@/lib/photo';
import { spacing } from '@/theme';

export default function AddLinkScreen() {
  const { t } = useTranslation();
  // Il sito può essere aperto dalla "Condividi" di Android o da un Comando rapido: /add?url=…&text=…
  const params = useLocalSearchParams<{ url?: string; text?: string; title?: string }>();
  const shared = readSharedParams(params);
  const [link, setLink] = useState(shared.link);
  const [text, setText] = useState(shared.text);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const save = useSaveLink();
  const photo = useSavePhoto();
  const [photoError, setPhotoError] = useState<unknown>(null);
  const busy = save.isPending || photo.isPending;

  async function paste() {
    setFieldError(null);
    try {
      const value = (await Clipboard.getStringAsync()).trim();
      const found = findUrl(value);
      if (found) {
        setLink(found);
        const rest = value.replace(found, '').trim();
        if (rest && !text) setText(rest);
      } else if (value) {
        setLink(value);
      }
    } catch {
      setFieldError(t('add.pasteFailed'));
    }
  }

  function goToResult(result: SaveLinkResult) {
    const dest = destinationAfterSave(result.source.id, result.analysis);
    const notice = analysisMessageKey(result.analysis);
    router.replace({
      pathname: dest.pathname,
      params: {
        id: dest.id,
        ...(dest.pathname === '/source/[id]' && notice ? { notice } : {}),
        ...(result.duplicate ? { duplicate: '1' } : {}),
      },
    });
  }

  async function uploadPhoto() {
    setPhotoError(null);
    try {
      const picked = await pickRecipePhoto();
      if (!picked) return;
      photo.mutate(
        { imageBase64: picked.base64, mimeType: picked.mimeType, text: text.trim() || undefined },
        { onSuccess: goToResult },
      );
    } catch (e) {
      setPhotoError(e);
    }
  }

  function submit() {
    const url = findUrl(link) ?? findUrl(text);
    if (!url) {
      setFieldError(link.trim() ? t('errors.invalidUrl') : t('add.linkRequired'));
      return;
    }
    setFieldError(null);
    save.mutate(
      { url, text: text.trim() || undefined },
      { onSuccess: goToResult },
    );
  }

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <AppText variant="heading">{t('add.title')}</AppText>
          <AppText tone="secondary">{t('add.subtitle')}</AppText>
        </View>

        <InlineError message={save.isError ? errorMessage(save.error, t) : null} />

        <Button label={t('add.writeOwn')} variant="secondary" onPress={() => router.replace('/recipe/new')} disabled={busy} />

        <View style={styles.photo}>
          <Button
            label={photo.isPending ? t('add.photoSaving') : t('add.photo')}
            variant="secondary"
            onPress={uploadPhoto}
            loading={photo.isPending}
            disabled={busy}
          />
          <AppText variant="caption" tone="secondary">
            {t('add.photoHint')}
          </AppText>
          <InlineError
            message={photo.isError ? errorMessage(photo.error, t) : photoError ? errorMessage(photoError, t) : null}
          />
        </View>
        <AppText variant="caption" tone="secondary" style={styles.or}>
          {t('add.orLink')}
        </AppText>

        <View style={styles.linkRow}>
          <View style={styles.flex}>
            <TextField
              label={t('add.linkLabel')}
              value={link}
              onChangeText={(value) => {
                setLink(value);
                if (fieldError) setFieldError(null);
              }}
              placeholder={t('add.linkPlaceholder')}
              error={fieldError}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              inputMode="url"
              returnKeyType="go"
              onSubmitEditing={submit}
              autoFocus={!shared.link}
            />
          </View>
          <View style={styles.pasteButton}>
            <Button label={t('add.paste')} variant="secondary" onPress={paste} disabled={busy} />
          </View>
        </View>

        <TextField
          label={t('add.textLabel')}
          hint={t('add.textHint')}
          value={text}
          onChangeText={setText}
          multiline
          numberOfLines={4}
          style={styles.textArea}
          textAlignVertical="top"
        />

        <Button label={save.isPending ? t('add.saving') : t('add.save')} onPress={submit} loading={save.isPending} disabled={busy} />
        <Button label={t('common.cancel')} variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/library'))} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  header: { gap: spacing.xs },
  photo: { gap: spacing.xs },
  or: { textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.6 },
  linkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1 },
  pasteButton: { marginTop: 22 },
  textArea: { minHeight: 110 },
});
