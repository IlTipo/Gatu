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
import { useSaveLink } from '@/features/sources/api';
import { findUrl, readSharedParams } from '@/features/sources/helpers';
import { errorMessage } from '@/lib/errors';
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

  function submit() {
    const url = findUrl(link) ?? findUrl(text);
    if (!url) {
      setFieldError(link.trim() ? t('errors.invalidUrl') : t('add.linkRequired'));
      return;
    }
    setFieldError(null);
    save.mutate(
      { url, text: text.trim() || undefined },
      {
        onSuccess: (result) => {
          router.replace({
            pathname: '/source/[id]',
            params: {
              id: result.source.id,
              ...(result.needsText ? { needsText: '1' } : {}),
              ...(result.duplicate ? { duplicate: '1' } : {}),
            },
          });
        },
      },
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
            <Button label={t('add.paste')} variant="secondary" onPress={paste} disabled={save.isPending} />
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

        <Button label={save.isPending ? t('add.saving') : t('add.save')} onPress={submit} loading={save.isPending} />
        <Button label={t('common.cancel')} variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/library'))} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  header: { gap: spacing.xs },
  linkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1 },
  pasteButton: { marginTop: 22 },
  textArea: { minHeight: 110 },
});
