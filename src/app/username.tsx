import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { InlineError } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMyProfile, useUpdateMyProfile } from '@/features/social/api';
import { useUsernameAvailable } from '@/features/social/network';
import { cleanUsername, isValidUsername, suggestUsername } from '@/features/social/username';
import { errorMessage } from '@/lib/errors';
import { spacing } from '@/theme';

/** Scegli il tuo @username (obbligatorio la prima volta, poi si può cambiare dal Profilo). */
export default function UsernameScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const me = useMyProfile();
  const update = useUpdateMyProfile();
  const [value, setValue] = useState('');
  const [debounced, setDebounced] = useState('');
  const [touched, setTouched] = useState(false);
  const [taken, setTaken] = useState(false);
  const isChange = !!me.data?.username;

  // proposta iniziale: lo username attuale o uno dal nome
  if (!touched && !value && me.data) {
    setValue(me.data.username ?? suggestUsername(me.data.display_name, session?.user.email));
  }
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 350);
    return () => clearTimeout(timer);
  }, [value]);

  const valid = isValidUsername(value);
  const unchanged = value === me.data?.username;
  const available = useUsernameAvailable(debounced, valid && debounced === value && !unchanged);
  const status = !value
    ? null
    : !valid
      ? t('username.invalid')
      : unchanged
        ? null
        : taken || available.data === false
          ? t('username.taken')
          : available.data === true
            ? t('username.free')
            : t('username.checking');
  const canSave = valid && !taken && (unchanged || available.data === true);

  const save = () => {
    if (unchanged) {
      router.replace('/library');
      return;
    }
    update.mutate(
      { username: value },
      {
        onSuccess: () => (isChange && router.canGoBack() ? router.back() : router.replace('/social')),
        onError: (e) => {
          if ((e as { code?: string }).code === '23505') setTaken(true);
        },
      },
    );
  };

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.container}>
        <AppText style={styles.emoji}>👋</AppText>
        <AppText variant="title">{isChange ? t('username.changeTitle') : t('username.title')}</AppText>
        <AppText tone="secondary">{t('username.hint')}</AppText>
        <TextField
          label={t('username.label')}
          value={value}
          onChangeText={(v) => {
            setTouched(true);
            setTaken(false);
            setValue(cleanUsername(v));
          }}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={30}
          placeholder="giulia.rossi"
          onSubmitEditing={canSave ? save : undefined}
        />
        <AppText variant="bodyStrong">@{value || '…'}</AppText>
        {status ? (
          <AppText tone={status === t('username.free') ? 'default' : 'secondary'}>{status}</AppText>
        ) : null}
        <AppText variant="caption" tone="secondary">
          {t('username.rules')}
        </AppText>
        <InlineError message={update.isError && !taken ? errorMessage(update.error, t) : null} />
        <Button label={t('username.save')} onPress={save} loading={update.isPending} disabled={!canSave} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, paddingTop: spacing.xl, paddingBottom: spacing.xl },
  emoji: { fontSize: 48, lineHeight: 56 },
});
