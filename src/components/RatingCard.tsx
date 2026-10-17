import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useUpdateMeta } from '@/features/ratings/api';
import { formatWhen, MAX_NOTES } from '@/features/ratings/format';
import type { ItemStatus } from '@/features/recipes/types';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { Chip } from './Chip';
import { InlineError } from './StateViews';
import { TextField } from './TextField';

type Props = {
  kind: 'recipe' | 'place';
  id: string;
  status: ItemStatus;
  rating: number | null;
  notes: string | null;
  doneAt: string | null;
};

/** Stato (da provare/provata), stelle, "fatto oggi" e note personali. */
export function RatingCard({ kind, id, status, rating, notes, doneAt }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const update = useUpdateMeta(kind, id);
  const [draft, setDraft] = useState(notes ?? '');
  const [savedNotes, setSavedNotes] = useState(false);
  const notesChanged = draft.trim() !== (notes ?? '').trim();

  const saveNotes = () =>
    update.mutate({ notes: draft.trim() ? draft.trim().slice(0, MAX_NOTES) : null }, { onSuccess: () => setSavedNotes(true) });

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <AppText variant="bodyStrong">{t('rating.title')}</AppText>
      <View style={styles.row}>
        <Chip label={t('rating.toTry')} selected={status === 'to_try'} onPress={() => update.mutate({ status: 'to_try' })} />
        <Chip
          label={kind === 'recipe' ? t('rating.triedRecipe') : t('rating.triedPlace')}
          selected={status === 'tried'}
          onPress={() => update.mutate({ status: 'tried' })}
        />
      </View>

      <Stars value={rating} onChange={(value) => update.mutate({ rating: value, ...(value ? { status: 'tried' as const } : {}) })} />

      <View style={styles.block}>
        <Button
          label={kind === 'recipe' ? t('rating.cookedToday') : t('rating.visitedToday')}
          variant="secondary"
          onPress={() => update.mutate({ status: 'tried', done_at: new Date().toISOString() })}
        />
        {doneAt ? (
          <AppText variant="caption" tone="secondary">
            {kind === 'recipe'
              ? t('rating.cookedWhen', { when: formatWhen(doneAt) })
              : t('rating.visitedWhen', { when: formatWhen(doneAt) })}
          </AppText>
        ) : null}
      </View>

      <TextField
        label={t('rating.notes')}
        value={draft}
        onChangeText={(v) => {
          setDraft(v);
          setSavedNotes(false);
        }}
        placeholder={kind === 'recipe' ? t('rating.notesPlaceholderRecipe') : t('rating.notesPlaceholderPlace')}
        multiline
        numberOfLines={3}
        maxLength={MAX_NOTES}
        style={styles.notes}
        textAlignVertical="top"
      />
      {notesChanged ? (
        <Button label={t('rating.saveNotes')} onPress={saveNotes} loading={update.isPending} />
      ) : savedNotes ? (
        <AppText variant="caption" style={{ color: colors.success }}>
          {t('rating.saved')}
        </AppText>
      ) : null}
      <InlineError message={update.isError ? errorMessage(update.error, t) : null} />
    </View>
  );
}

/** Cinque stelle grandi da toccare; toccare di nuovo la stessa toglie il voto. */
export function Stars({ value, onChange, size = 34 }: { value: number | null; onChange: (v: number | null) => void; size?: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.stars} accessibilityRole="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = (value ?? 0) >= n;
        return (
          <Pressable
            key={n}
            onPress={() => onChange(value === n ? null : n)}
            accessibilityRole="radio"
            accessibilityState={{ checked: value === n }}
            accessibilityLabel={value === n ? t('rating.clearStars') : t('rating.star', { count: n })}
            hitSlop={4}>
            <AppText style={{ fontSize: size, lineHeight: size + 6, color: on ? '#F2A900' : colors.border }}>★</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  block: { gap: spacing.xs },
  stars: { flexDirection: 'row', gap: spacing.xs },
  notes: { minHeight: 90 },
});
