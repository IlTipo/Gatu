import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { FadeIn, PressableScale } from '@/components/Motion';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { ErrorState, InlineError, LoadingState } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import {
  type Friend,
  useFriends,
  useMyProfile,
  useRemoveFriend,
  useRespondFriend,
  useSendFriendRequest,
  useUpdateMyProfile,
} from '@/features/social/api';
import { confirm } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';
import { shareLink, siteUrl } from '@/lib/share';
import { radius, spacing, useTheme } from '@/theme';

/** Amici: il mio codice, aggiungi con un codice, richieste, elenco e cosa condivido. */
export default function FriendsScreen() {
  const { t } = useTranslation();
  const friends = useFriends();
  const incoming = friends.data?.filter((f) => f.status === 'pending' && f.incoming) ?? [];
  const outgoing = friends.data?.filter((f) => f.status === 'pending' && !f.incoming) ?? [];
  const accepted = friends.data?.filter((f) => f.status === 'accepted') ?? [];

  return (
    <Screen scroll>
      <View style={styles.container}>
        <BackButton />
        <AppText variant="title">{t('friends.title')}</AppText>
        <InviteCard />
        <AddByCode />
        {friends.isPending ? (
          <LoadingState />
        ) : friends.isError ? (
          <ErrorState message={errorMessage(friends.error, t)} onRetry={() => friends.refetch()} />
        ) : (
          <>
            {incoming.length ? (
              <Section title={t('friends.incoming')}>
                {incoming.map((f) => (
                  <RequestRow key={f.id} friend={f} />
                ))}
              </Section>
            ) : null}
            <Section title={t('friends.list', { count: accepted.length })}>
              {accepted.length ? (
                accepted.map((f, i) => (
                  <FadeIn key={f.id} index={i}>
                    <FriendRow friend={f} />
                  </FadeIn>
                ))
              ) : (
                <AppText tone="secondary">{t('friends.empty')}</AppText>
              )}
            </Section>
            {outgoing.length ? (
              <Section title={t('friends.outgoing')}>
                {outgoing.map((f) => (
                  <OutgoingRow key={f.id} friend={f} />
                ))}
              </Section>
            ) : null}
          </>
        )}
        <PrivacyCard />
      </View>
    </Screen>
  );
}

function InviteCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const me = useMyProfile();
  const [message, setMessage] = useState<string | null>(null);
  const code = me.data?.friend_code;
  const invite = async () => {
    if (!code) return;
    const res = await shareLink({ title: 'Morso', text: t('friends.inviteText', { code }), url: `${siteUrl()}/invite/${code}` });
    setMessage(res === 'copied' ? t('profile.linkCopied') : res === 'failed' ? t('profile.shareFailed') : null);
  };
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <AppText tone="secondary">{t('friends.myCode')}</AppText>
      <AppText variant="title" selectable style={styles.code}>
        {code ?? '…'}
      </AppText>
      <Button label={t('friends.invite')} onPress={invite} disabled={!code} />
      {message ? <AppText tone="secondary">{message}</AppText> : null}
    </View>
  );
}

function AddByCode() {
  const { t } = useTranslation();
  const send = useSendFriendRequest();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const clean = code.replace(/\s+/g, '').toUpperCase();
  const submit = () =>
    send.mutate(clean, {
      onSuccess: (res) => {
        setMessage(t(`friends.result.${res}`));
        if (res === 'sent' || res === 'accepted') setCode('');
      },
    });
  return (
    <View style={styles.add}>
      <View style={styles.flex}>
        <TextField
          label={t('friends.addLabel')}
          placeholder="ABCD1234"
          value={code}
          onChangeText={(v) => {
            setCode(v);
            setMessage(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          onSubmitEditing={submit}
        />
      </View>
      <Button label={t('friends.add')} onPress={submit} loading={send.isPending} disabled={clean.length < 4} />
      {message ? <AppText tone="secondary">{message}</AppText> : null}
      <InlineError message={send.isError ? errorMessage(send.error, t) : null} />
    </View>
  );
}

function RequestRow({ friend: f }: { friend: Friend }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const respond = useRespondFriend();
  return (
    <View style={[styles.row, styles.card, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
      <Avatar url={f.avatar_url} name={f.display_name} size={44} zoomable />
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{f.display_name ?? t('friends.someone')}</AppText>
        <AppText variant="caption" tone="secondary">
          {t('friends.wantsToBeFriends')}
        </AppText>
        <View style={styles.actions}>
          <View style={styles.flex}>
            <Button label={t('friends.accept')} onPress={() => respond.mutate({ id: f.id, accept: true })} loading={respond.isPending} />
          </View>
          <View style={styles.flex}>
            <Button label={t('friends.decline')} variant="ghost" onPress={() => respond.mutate({ id: f.id, accept: false })} />
          </View>
        </View>
        <InlineError message={respond.isError ? errorMessage(respond.error, t) : null} />
      </View>
    </View>
  );
}

function FriendRow({ friend: f }: { friend: Friend }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/friend/[id]', params: { id: f.user_id, friendship: f.id } })}
      accessibilityRole="button"
      style={[styles.row, styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Avatar url={f.avatar_url} name={f.display_name} size={44} zoomable />
      <AppText variant="bodyStrong" style={styles.flex}>
        {f.display_name ?? t('friends.someone')}
      </AppText>
      <AppText variant="heading" tone="secondary">
        ›
      </AppText>
    </PressableScale>
  );
}

function OutgoingRow({ friend: f }: { friend: Friend }) {
  const { t } = useTranslation();
  const remove = useRemoveFriend();
  const cancel = async () => {
    if (await confirm(t('friends.cancelConfirm'), { ok: t('friends.cancelRequest'), cancel: t('common.cancel') })) remove.mutate(f.id);
  };
  return (
    <View style={styles.row}>
      <Avatar url={f.avatar_url} name={f.display_name} size={32} zoomable />
      <AppText style={styles.flex}>
        {f.display_name ?? t('friends.someone')} · {t('friends.waiting')}
      </AppText>
      <Button label={t('friends.cancelRequest')} variant="ghost" onPress={cancel} loading={remove.isPending} />
    </View>
  );
}

/** Cosa vedono i miei amici. */
function PrivacyCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const me = useMyProfile();
  const update = useUpdateMyProfile();
  const items = [
    { key: 'share_cooking', label: t('friends.shareCooking') },
    { key: 'share_planner', label: t('friends.sharePlanner') },
    { key: 'share_diary', label: t('friends.shareDiary') },
  ] as const;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <AppText variant="bodyStrong">{t('friends.privacyTitle')}</AppText>
      <AppText variant="caption" tone="secondary">
        {t('friends.privacyHint')}
      </AppText>
      {items.map((item) => (
        <View key={item.key} style={styles.row}>
          <AppText style={styles.flex}>{item.label}</AppText>
          <Switch
            value={!!me.data?.[item.key]}
            disabled={!me.data}
            onValueChange={(value) => update.mutate({ [item.key]: value })}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={colors.surface}
            accessibilityLabel={item.label}
          />
        </View>
      ))}
      <InlineError message={update.isError ? errorMessage(update.error, t) : null} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  card: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm },
  code: { letterSpacing: 4 },
  add: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  flex: { flex: 1, gap: 2 },
});
