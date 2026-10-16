import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { ErrorState, InlineError, LoadingState } from '@/components/StateViews';
import { usePlace, useRefreshPlace, useSetWishlist } from '@/features/places/api';
import {
  distanceMeters,
  formatDistance,
  formatOpeningHours,
  googleMapsUrl,
  phoneHref,
  priceLabel,
} from '@/features/places/format';
import type { Place } from '@/features/places/types';
import { errorMessage } from '@/lib/errors';
import { getCurrentCoords } from '@/lib/location';
import { openExternalUrl } from '@/lib/openUrl';
import { radius, spacing, useTheme } from '@/theme';

export default function PlaceScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const place = usePlace(id);

  if (place.isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  if (place.isError) {
    return (
      <Screen>
        <BackButton />
        <ErrorState message={errorMessage(place.error, t)} onRetry={() => place.refetch()} />
      </Screen>
    );
  }

  return <PlaceDetails place={place.data} />;
}

function PlaceDetails({ place: p }: { place: Place }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const wishlist = useSetWishlist(p.id);
  const refresh = useRefreshPlace(p.id);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [distance, setDistance] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const hasCoords = p.latitude !== null && p.longitude !== null;
  const hours = formatOpeningHours(p.opening_hours);
  const missingInfo = !p.phone || !p.website || !p.opening_hours;

  async function showDistance() {
    if (!hasCoords) return;
    setLocating(true);
    setLocationError(null);
    try {
      const me = await getCurrentCoords();
      setDistance(formatDistance(distanceMeters(me, { latitude: p.latitude!, longitude: p.longitude! })));
    } catch (e) {
      setLocationError(errorMessage(e, t));
    } finally {
      setLocating(false);
    }
  }

  function runRefresh() {
    setRefreshMessage(null);
    refresh.mutate(undefined, {
      onSuccess: (res) =>
        setRefreshMessage(
          res.status === 'done' ? t('place.refreshDone') : res.status === 'not_found' ? t('place.refreshNotFound') : t('recipe.aiError'),
        ),
    });
  }

  const subtitle = [p.cuisine, priceLabel(p.price_level), p.city].filter(Boolean).join(' · ');

  return (
    <Screen scroll>
      <View style={styles.container}>
        <BackButton />
        {p.image_url ? (
          <View style={[styles.image, { backgroundColor: colors.surfaceMuted }]}>
            <Image source={{ uri: p.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          </View>
        ) : null}

        <View style={styles.titleBlock}>
          <AppText variant="title">{p.name}</AppText>
          {subtitle ? <AppText variant="bodyStrong" tone="secondary">{subtitle}</AppText> : null}
        </View>

        <View style={[styles.address, { backgroundColor: colors.surfaceMuted }]}>
          <Icon name={{ ios: 'mappin.and.ellipse', android: 'place' }} size={22} color={colors.primary} />
          <View style={styles.flex}>
            <AppText>{p.address ?? p.city ?? '—'}</AppText>
            <AppText variant="caption" style={{ color: p.verified ? colors.success : colors.textSecondary }}>
              {p.verified ? `✓ ${t('place.verified')}` : t('place.notVerified')}
            </AppText>
            {hasCoords ? (
              distance ? (
                <AppText variant="bodyStrong" tone="primary">
                  📍 {t('place.distance', { distance })}
                </AppText>
              ) : (
                <Pressable onPress={showDistance} disabled={locating} accessibilityRole="button">
                  <AppText variant="caption" tone="primary">
                    {locating ? t('nearby.finding') : `📍 ${t('place.showDistance')}`}
                  </AppText>
                </Pressable>
              )
            ) : null}
            <InlineError message={locationError} />
          </View>
        </View>

        <Button
          label={p.wishlist ? t('place.wishlistOn') : t('place.wishlistAdd')}
          variant={p.wishlist ? 'primary' : 'secondary'}
          onPress={() => wishlist.mutate(!p.wishlist)}
          loading={wishlist.isPending}
        />
        <InlineError message={wishlist.isError ? errorMessage(wishlist.error, t) : null} />

        {p.phone || p.website || hours.length ? (
          <View style={[styles.info, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            {p.phone ? (
              <InfoRow label={t('place.phone')}>
                <Pressable onPress={() => openExternalUrl(phoneHref(p.phone!))} accessibilityRole="link">
                  <AppText tone="primary">{p.phone}</AppText>
                </Pressable>
              </InfoRow>
            ) : null}
            {p.website ? (
              <InfoRow label={t('place.website')}>
                <Pressable onPress={() => openExternalUrl(p.website!)} accessibilityRole="link">
                  <AppText tone="primary" numberOfLines={1}>
                    {p.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                  </AppText>
                </Pressable>
              </InfoRow>
            ) : null}
            {hours.length ? (
              <InfoRow label={t('place.hours')}>
                {hours.map((line) => <AppText key={line}>{line}</AppText>)}
                <AppText variant="caption" tone="secondary">
                  {t('place.hoursNote')}
                </AppText>
              </InfoRow>
            ) : null}
          </View>
        ) : null}

        <View style={styles.buttons}>
          <Button label={t('place.openMaps')} onPress={() => openExternalUrl(googleMapsUrl(p))} />
          <Button
            label={t('common.edit')}
            variant="secondary"
            onPress={() => router.push({ pathname: '/place/[id]/edit', params: { id: p.id } })}
          />
        </View>

        {p.recommended_dishes.length ? (
          <Section title={t('place.dishes')}>
            <View style={styles.chips}>
              {p.recommended_dishes.map((d) => <Chip key={d} label={d} />)}
            </View>
          </Section>
        ) : null}

        {missingInfo ? (
          <View style={styles.buttons}>
            <Button
              label={refresh.isPending ? t('place.refreshing') : t('place.refresh')}
              variant="ghost"
              onPress={runRefresh}
              loading={refresh.isPending}
            />
            {refreshMessage ? <AppText tone="secondary">{refreshMessage}</AppText> : null}
            <InlineError message={refresh.isError ? errorMessage(refresh.error, t) : null} />
          </View>
        ) : null}

        {p.source_id ? (
          <Button
            label={t('source.title')}
            variant="ghost"
            onPress={() => router.push({ pathname: '/source/[id]', params: { id: p.source_id! } })}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.infoRow}>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  info: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  infoRow: { gap: spacing.xs },
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  image: { width: '100%', aspectRatio: 16 / 9, maxHeight: 320, borderRadius: radius.lg, overflow: 'hidden' },
  titleBlock: { gap: spacing.xs },
  address: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, alignItems: 'flex-start' },
  buttons: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1, gap: spacing.xs },
});
