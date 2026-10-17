import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { AvatarCropper } from '@/components/AvatarCropper';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Collapsible } from '@/components/Collapsible';
import { FadeIn, PressableScale } from '@/components/Motion';
import { PortionsCard } from '@/components/PortionsCard';
import { Screen } from '@/components/Screen';
import { InlineError } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDeleteAccount, useExportMyData } from '@/features/legal/api';
import { useChangeAvatar, useFriends, useMyProfile, useSendFeedback, useUpdateMyProfile } from '@/features/social/api';
import { errorMessage } from '@/lib/errors';
import { openExternalUrl } from '@/lib/openUrl';
import { pickRawPhoto, type RawPhoto } from '@/lib/photo';
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

        <SocialSettings />

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
        <PrivacyDataCard />

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
  // foto scelta, da sistemare nel cerchio prima di salvarla
  const [picked, setPicked] = useState<RawPhoto | null>(null);
  const [pickError, setPickError] = useState<unknown>(null);
  const choosePhoto = async () => {
    setPickError(null);
    try {
      const photo = await pickRawPhoto();
      if (photo) setPicked(photo);
    } catch (e) {
      setPickError(e);
    }
  };
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
        onPress={choosePhoto}
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
      {picked ? (
        <AvatarCropper
          photo={picked}
          busy={avatar.isPending}
          onCancel={() => setPicked(null)}
          onConfirm={(rect) =>
            avatar.mutate({ photo: picked, rect, previousUrl: me.data?.avatar_url ?? null }, { onSuccess: () => setPicked(null) })
          }
        />
      ) : null}
      <InlineError
        message={
          pickError ? errorMessage(pickError, t) : avatar.isError ? errorMessage(avatar.error, t) : update.isError ? errorMessage(update.error, t) : me.isError ? errorMessage(me.error, t) : null
        }
      />
    </View>
  );
}

/** Parte social del profilo: @username, bio, pubblico/privato, link al mio profilo. */
function SocialSettings() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const me = useMyProfile();
  const update = useUpdateMyProfile();
  const [bio, setBio] = useState<string | null>(null);
  const shownBio = bio ?? me.data?.bio ?? '';
  const bioChanged = bio !== null && bio.trim() !== (me.data?.bio ?? '');
  if (!me.data) return null;
  return (
    <View style={[styles.card, styles.social, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppText variant="bodyStrong">@{me.data.username}</AppText>
          <Pressable onPress={() => router.push('/username')} accessibilityRole="button" hitSlop={6}>
            <AppText variant="caption" tone="primary">
              {t('social.changeUsername')}
            </AppText>
          </Pressable>
        </View>
        <Button label={t('social.seeMyProfile')} variant="secondary" onPress={() => router.push({ pathname: '/u/[id]', params: { id: 'me' } })} />
      </View>
      <TextField label={t('social.bio')} value={shownBio} onChangeText={setBio} maxLength={160} multiline placeholder={t('social.bioPlaceholder')} />
      {bioChanged ? (
        <Button
          label={t('common.save')}
          onPress={() => update.mutate({ bio: shownBio.trim() || null }, { onSuccess: () => setBio(null) })}
          loading={update.isPending}
        />
      ) : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{me.data.is_public ? t('social.publicProfile') : t('social.privateProfile')}</AppText>
          <AppText variant="caption" tone="secondary">
            {me.data.is_public ? t('social.publicHint') : t('social.privateHint')}
          </AppText>
        </View>
        <Switch
          value={me.data.is_public}
          onValueChange={(v) => update.mutate({ is_public: v })}
          trackColor={{ true: colors.primary, false: colors.border }}
          thumbColor={colors.surface}
          accessibilityLabel={t('social.publicProfile')}
        />
      </View>
      <InlineError message={update.isError ? errorMessage(update.error, t) : null} />
    </View>
  );
}

/** Privacy e dati: pagine legali, persone bloccate, scarica i miei dati, elimina account. */
function PrivacyDataCard() {
  const { t } = useTranslation();
  const exportData = useExportMyData();
  const deleteAccount = useDeleteAccount();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const canDelete = confirmText.trim().toUpperCase() === 'ELIMINA';
  return (
    <Collapsible title={t('legal.dataTitle')} summary={t('legal.dataSummary')}>
      <Button label={t('legal.privacy')} variant="ghost" onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })} />
      <Button label={t('legal.terms')} variant="ghost" onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })} />
      <Button label={t('block.title')} variant="ghost" onPress={() => router.push('/blocked')} />
      <Button label={t('legal.export')} variant="secondary" onPress={() => exportData.mutate()} loading={exportData.isPending} />
      {exportData.isSuccess ? <AppText tone="secondary">{t('legal.exportDone')}</AppText> : null}
      <InlineError message={exportData.isError ? errorMessage(exportData.error, t) : null} />
      {deleting ? (
        <>
          <AppText tone="secondary">{t('legal.deleteWarning')}</AppText>
          <TextField label={t('legal.deleteType')} value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" />
          <Button
            label={t('legal.deleteForever')}
            onPress={() => deleteAccount.mutate()}
            disabled={!canDelete}
            loading={deleteAccount.isPending}
          />
          <Button label={t('common.cancel')} variant="ghost" onPress={() => setDeleting(false)} />
          <InlineError message={deleteAccount.isError ? errorMessage(deleteAccount.error, t) : null} />
        </>
      ) : (
        <Button label={t('legal.delete')} variant="ghost" onPress={() => setDeleting(true)} />
      )}
    </Collapsible>
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
  social: { gap: spacing.md },
  madeBy: { alignSelf: 'center', marginTop: -spacing.md, padding: spacing.xs },
  link: { textDecorationLine: 'underline' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
});
