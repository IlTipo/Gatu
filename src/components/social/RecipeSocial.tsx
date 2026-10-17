import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { type Comment, useAddComment, useDeleteComment, useRecipeSocial, useReportComment, useToggleLike } from '@/features/social/network';
import { timeAgo } from '@/features/social/time';
import { confirm } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from '../AppText';
import { Avatar } from '../Avatar';
import { Button } from '../Button';
import { PopOnChange } from '../Motion';
import { Section } from '../Section';
import { InlineError } from '../StateViews';
import { TextField } from '../TextField';

/** ❤️ e 💬 di una ricetta condivisa: mi piace, commenti, cancella e segnala. */
export function RecipeSocial({ recipeId }: { recipeId: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const social = useRecipeSocial(recipeId);
  const like = useToggleLike(recipeId);
  const add = useAddComment(recipeId);
  const [text, setText] = useState('');

  if (social.isPending) return null;
  if (social.isError) return null; // ricetta non condivisa: niente parte social
  const s = social.data;
  const send = () => add.mutate(text.trim(), { onSuccess: () => setText('') });

  return (
    <Section title={t('social.commentsTitle', { count: s.comments.length })}>
      <PopOnChange value={s.liked}>
        <Pressable
          onPress={() => like.mutate()}
          accessibilityRole="button"
          accessibilityState={{ selected: s.liked }}
          accessibilityLabel={s.liked ? t('social.unlike') : t('social.like')}
          style={[styles.like, { borderColor: s.liked ? colors.primary : colors.border, backgroundColor: colors.surface }]}>
          <AppText variant="heading">{s.liked ? '❤️' : '🤍'}</AppText>
          <AppText variant="bodyStrong">{t('social.likesCount', { count: s.likes })}</AppText>
        </Pressable>
      </PopOnChange>

      {s.comments.map((c) => (
        <CommentRow key={c.id} comment={c} recipeId={recipeId} />
      ))}

      <TextField
        label={t('social.writeComment')}
        value={text}
        onChangeText={setText}
        placeholder={t('social.commentPlaceholder')}
        maxLength={500}
        multiline
      />
      <Button label={t('social.sendComment')} onPress={send} loading={add.isPending} disabled={!text.trim()} />
      <InlineError message={add.isError ? errorMessage(add.error, t) : like.isError ? errorMessage(like.error, t) : null} />
    </Section>
  );
}

function CommentRow({ comment: c, recipeId }: { comment: Comment; recipeId: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const remove = useDeleteComment(recipeId);
  const report = useReportComment();
  const [reported, setReported] = useState(false);

  const del = async () => {
    if (await confirm(t('social.deleteCommentConfirm'), { ok: t('common.delete'), cancel: t('common.cancel') })) remove.mutate(c.id);
  };
  const flag = async () => {
    if (await confirm(t('social.reportConfirm'), { ok: t('social.report'), cancel: t('common.cancel') }))
      report.mutate({ commentId: c.id, reason: '' }, { onSuccess: () => setReported(true) });
  };

  return (
    <View style={[styles.comment, { backgroundColor: colors.surfaceMuted, opacity: remove.isPending ? 0.5 : 1 }]}>
      <Pressable onPress={() => router.push({ pathname: '/u/[id]', params: { id: c.author_id } })} accessibilityRole="button">
        <Avatar url={c.avatar_url} name={c.display_name ?? c.username} size={32} />
      </Pressable>
      <View style={styles.flex}>
        <AppText>
          <AppText variant="bodyStrong">@{c.username} </AppText>
          {c.body}
        </AppText>
        <View style={styles.meta}>
          <AppText variant="caption" tone="secondary">
            {timeAgo(c.created_at)}
          </AppText>
          {c.can_delete ? (
            <Pressable onPress={del} accessibilityRole="button" hitSlop={6}>
              <AppText variant="caption" tone="danger">
                {t('common.delete')}
              </AppText>
            </Pressable>
          ) : null}
          <Pressable onPress={reported ? undefined : flag} accessibilityRole="button" hitSlop={6}>
            <AppText variant="caption" tone="secondary">
              {reported ? t('social.reported') : `🚩 ${t('social.report')}`}
            </AppText>
          </Pressable>
        </View>
        <InlineError message={report.isError ? errorMessage(report.error, t) : null} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  like: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: 1.5 },
  comment: { flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md },
  meta: { flexDirection: 'row', gap: spacing.md, marginTop: 2 },
  flex: { flex: 1, gap: 2 },
});
