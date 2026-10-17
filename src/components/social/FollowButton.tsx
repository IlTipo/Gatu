import { useTranslation } from 'react-i18next';

import { type Following, useFollow, useUnfollow } from '@/features/social/network';
import { confirm } from '@/lib/confirm';

import { Chip } from '../Chip';

/** Segui / Richiesta inviata / Segui già (tocca per smettere). */
export function FollowButton({ userId, following, isPublic }: { userId: string; following: Following; isPublic: boolean }) {
  const { t } = useTranslation();
  const follow = useFollow();
  const unfollow = useUnfollow();
  const busy = follow.isPending || unfollow.isPending;
  // mentre aspetta la risposta mostra già il risultato
  const shown: Following = follow.isPending ? (isPublic ? 'accepted' : 'pending') : unfollow.isPending ? 'none' : following;

  const press = async () => {
    if (shown === 'none') follow.mutate(userId);
    else if (await confirm(shown === 'pending' ? t('social.cancelRequestConfirm') : t('social.unfollowConfirm'), { ok: t('common.confirm'), cancel: t('common.cancel') }))
      unfollow.mutate(userId);
  };
  const label = shown === 'accepted' ? t('social.following') : shown === 'pending' ? t('social.requested') : t('social.follow');
  return <Chip label={label} selected={shown === 'none'} onPress={busy ? undefined : press} />;
}
