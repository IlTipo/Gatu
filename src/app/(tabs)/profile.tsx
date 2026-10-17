import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Collapsible } from '@/components/Collapsible';
import { FadeIn, PressableScale } from '@/components/Motion';
import { PortionsCard } from '@/components/PortionsCard';
import { Screen } from '@/components/Screen';
import { InlineError } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/features/auth/AuthProvider';
import { useChangeAvatar, useFriends, useMyProfile, useSendFeedback, useUpdateMyProfile } from '@/features/social/api';
import { errorMessage } from '@/lib/errors';
import { openExternalUrl } from '@/lib/openUrl';
import { shareLink, siteUrl } from '@/lib/share';
import { supabase } from '@/lib/supabase';
import { CURRENT_VERSION, markNewsSeen, reloadApp, useNews, useUpdateState } from '@/lib/updates';
import { radius, setThemePreference, spacing, type ThemePreference, useTheme, useThemePreference } from '@/theme';

const THEMES: ThemePreference[] = ['system', 'light', 'dark'];
const AUTHOR_URL = 'https://www.instagram.com/endrisssss?mdxt=MW5xeDJjaHJhZGl5bA%3D%3D&utm_source=qr';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const themePreference = useThemePreference();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const friends = useFriends();
  const requests = friends.data?.filter((f) => f.status === 'pending' && f.incoming).length ?? 0;
  const friendCount = friends.data?.filter((f) => f.status === 'accepted').length ?? 0;

  async function signOut() {
    setSigningOut(true);
    setError(null);
    const { error: e } = await supabase.auth.signOut();
    if (e) {
      setError(errorMessage(e, t));
      setSigningOut(false);
    }
  }

  const shareApp = async () => {
    const res = await shareLink({ title: 'Morso', text: t('profile.shareText'), url: `${siteUrl()}/` });
    setShareMessage(res === 'copied' ? t('profile.linkCopied') : res === 'failed' ? t('profile.shareFailed') : null);
  };

  return (
    <Screen scroll>
      <View style={styles.container}>
        <AppText variant="title">{t('profile.title')}</AppText>
        <UpdateCard />
        <ProfileHeader />

        <PressableScale
          onPress={() => router.push('/friends')}
          accessibilityRole="button"
          style={[styles.row, styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="heading">👥</AppText>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{t('friends.title')}</AppText>
            <AppText variant="caption" tone="secondary">
              {requests ? t('friends.requestsBadge', { count: requests }) : t('friends.count', { count: friendCount })}
            </AppText>
          </View>
          {requests ? <View style={[styles.badge, { backgroundColor: colors.primary }]} /> : null}
          <AppText variant="heading" tone="secondary">
            ›
          </AppText>
        </PressableScale>

        <PressableScale
          onPress={() => router.push('/stats')}
          accessibilityRole="button"
          style={[styles.row, styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{t('stats.entry')}</AppText>
            <AppText variant="caption" tone="secondary">
              {t('stats.entryHint')}
            </AppText>
          </View>
          <AppText variant="heading" tone="secondary">
            ›
          </AppText>
        </PressableScale>

        <Button label={t('profile.shareApp')} variant="secondary" onPress={shareApp} />
        {shareMessage ? <AppText tone="secondary">{shareMessage}</AppText> : null}

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="bodyStrong">{t('profile.theme')}</AppText>
          <View style={styles.chips}>
            {THEMES.map((value) => (
              <Chip
                key={value}
                label={t(`profile.themes.${value}`)}
                selected={themePreference === value}
                onPress={() => setThemePreference(value)}
              />
            ))}
          </View>
        </View>
        <PortionsCard />
        <FeedbackCard />

        <InlineError message={error} />
        <Button label={t('profile.signOut')} variant="ghost" onPress={signOut} loading={signingOut} />
        <AppText variant="caption" tone="secondary" style={styles.version}>
          {t('profile.version', { version: Constants.expoConfig?.version ?? '?' })}
        </AppText>
        <Pressable onPress={() => openExternalUrl(AUTHOR_URL)} accessibilityRole="link" style={styles.madeBy}>
          <AppText variant="caption" tone="primary" style={styles.link}>
            {t('profile.madeBy')}
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}

/** "È disponibile Morso 1.0.1" (con le novità) oppure, dopo l'aggiornamento, "Novità di Morso 1.0.1". */
function UpdateCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const update = useUpdateState();
  const news = useNews();
  if (update.kind !== 'version' && !news) return null;
  const isAvailable = update.kind === 'version';
  const title = isAvailable ? t('updates.available', { version: update.version }) : t('updates.news', { version: CURRENT_VERSION });
  const notes = isAvailable ? update.notes : (news ?? []).flatMap((n) => n.notes);
  return (
    <FadeIn>
      <View style={[styles.card, styles.updateCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
        <AppText variant="bodyStrong">{title}</AppText>
        {notes.map((note, i) => (
          <AppText key={i} tone="secondary">
            • {note}
          </AppText>
        ))}
        {isAvailable ? (
          <Button label={t('updates.updateNow')} onPress={reloadApp} />
        ) : (
          <Button label={t('updates.gotIt')} variant="secondary" onPress={markNewsSeen} />
        )}
      </View>
    </FadeIn>
  );
}

/** Foto (tocca per cambiarla), nome modificabile ed email. */
function ProfileHeader() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { session } = useAuth();
  const me = useMyProfile();
  const update = useUpdateMyProfile();
  const avatar = useChangeAvatar();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  const startEdit = () => {
    setName(me.data?.display_name ?? '');
    setEditing(true);
  };
  const clean = name.replace(/\s+/g, ' ').trim();
  const saveName = () =>
    update.mutate({ display_name: clean || null }, { onSuccess: () => setEditing(false) });

  return (
    <View style={[styles.card, styles.header, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable
        onPress={() => avatar.mutate(me.data?.avatar_url ?? null)}
        disabled={avatar.isPending}
        accessibilityRole="button"
        accessibilityLabel={t('profile.changePhoto')}
        style={styles.avatarWrap}>
        <Avatar url={me.data?.avatar_url} name={me.data?.display_name ?? session?.user.email} size={84} />
        <View style={[styles.camera, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="caption">{avatar.isPending ? '…' : '📷'}</AppText>
        </View>
      </Pressable>
      {editing ? (
        <View style={styles.full}>
          <TextField label={t('profile.name')} value={name} onChangeText={setName} maxLength={50} autoFocus onSubmitEditing={saveName} />
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button label={t('common.save')} onPress={saveName} loading={update.isPending} />
            </View>
            <View style={styles.flex}>
              <Button label={t('common.cancel')} variant="ghost" onPress={() => setEditing(false)} />
            </View>
          </View>
        </View>
      ) : (
        <Pressable onPress={startEdit} accessibilityRole="button" accessibilityLabel={t('profile.editName')} style={styles.nameBox}>
          <AppText variant="heading" style={styles.center}>
            {me.data?.display_name || t('profile.noName')} ✏️
          </AppText>
          <AppText variant="caption" tone="secondary" style={styles.center}>
            {session?.user.email ?? ''}
          </AppText>
        </Pressable>
      )}
      <InlineError
        message={
          avatar.isError ? errorMessage(avatar.error, t) : update.isError ? errorMessage(update.error, t) : me.isError ? errorMessage(me.error, t) : null
        }
      />
    </View>
  );
}

/** "Cosa aggiungeresti?": il consiglio arriva per email. */
function FeedbackCard() {
  const { t } = useTranslation();
  const send = useSendFeedback();
  const [message, setMessage] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const clean = message.trim();
  const submit = () =>
    send.mutate(clean, {
      onSuccess: () => {
        setMessage('');
        setDone(t('feedback.thanks'));
      },
    });
  return (
    <Collapsible title={t('feedback.title')} summary={t('feedback.summary')}>
      <TextField
        label={t('feedback.label')}
        placeholder={t('feedback.placeholder')}
        value={message}
        onChangeText={(v) => {
          setMessage(v);
          setDone(null);
        }}
        multiline
        maxLength={1000}
      />
      <Button label={t('feedback.send')} onPress={submit} loading={send.isPending} disabled={clean.length < 3} />
      {done ? <AppText tone="secondary">{done}</AppText> : null}
      <InlineError message={send.isError ? errorMessage(send.error, t) : null} />
    </Collapsible>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  card: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs },
  header: { alignItems: 'center', gap: spacing.md },
  avatarWrap: { position: 'relative' },
  camera: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameBox: { alignItems: 'center', gap: 2 },
  center: { textAlign: 'center' },
  full: { alignSelf: 'stretch', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: 2 },
  badge: { width: 10, height: 10, borderRadius: 5 },
  version: { textAlign: 'center' },
  updateCard: { gap: spacing.sm, borderWidth: 1.5 },
  madeBy: { alignSelf: 'center', marginTop: -spacing.md, padding: spacing.xs },
  link: { textDecorationLine: 'underline' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
});
