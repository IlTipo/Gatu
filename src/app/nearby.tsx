import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { usePlacesWithLocation } from '@/features/places/api';
import { distanceMeters, formatDistance, priceLabel } from '@/features/places/format';
import type { Place } from '@/features/places/types';
import { errorMessage } from '@/lib/errors';
import { type Coords, getCurrentCoords } from '@/lib/location';
import { radius, spacing, useTheme } from '@/theme';

const RADII_KM = [2, 5, 10, 25];

type Nearby = Place & { meters: number };

/** I posti salvati vicino a dove sei adesso, con prima quelli "Voglio andarci". */
export default function NearbyScreen() {
  const { t } = useTranslation();
  const places = usePlacesWithLocation();
  // la posizione si chiede aprendo la schermata e vale per un minuto
  const location = useQuery({ queryKey: ['my-location'], queryFn: getCurrentCoords, retry: false, staleTime: 60_000 });
  const coords: Coords | undefined = location.data;
  const [radiusKm, setRadiusKm] = useState(5);

  let content;
  if (location.isError) {
    content = <ErrorState message={errorMessage(location.error, t)} onRetry={() => location.refetch()} />;
  } else if (places.isError) {
    content = <ErrorState message={errorMessage(places.error, t)} onRetry={() => places.refetch()} />;
  } else if (!coords || places.isPending) {
    content = <LoadingState message={t('nearby.finding')} />;
  } else if (places.data.length === 0) {
    content = <EmptyState title={t('nearby.noPlaces')} />;
  } else {
    const within = places.data
      .map((p): Nearby => ({ ...p, meters: distanceMeters(coords, { latitude: p.latitude!, longitude: p.longitude! }) }))
      .filter((p) => p.meters <= radiusKm * 1000)
      .sort((a, b) => a.meters - b.meters);
    const wished = within.filter((p) => p.wishlist);
    const others = within.filter((p) => !p.wishlist);
    content = (
      <View style={styles.content}>
        <View style={styles.radius}>
          <AppText variant="caption" tone="secondary">
            {t('nearby.radius')}
          </AppText>
          <View style={styles.chips}>
            {RADII_KM.map((km) => (
              <Chip key={km} label={`${km} km`} selected={radiusKm === km} onPress={() => setRadiusKm(km)} />
            ))}
          </View>
        </View>
        {within.length === 0 ? (
          <EmptyState title={t('nearby.empty', { distance: `${radiusKm} km` })} />
        ) : (
          <>
            {wished.length ? (
              <Section title={t('nearby.wishlist')}>
                {wished.map((p) => <PlaceRow key={p.id} place={p} />)}
              </Section>
            ) : null}
            {others.length ? (
              <Section title={t('nearby.others')}>
                {others.map((p) => <PlaceRow key={p.id} place={p} />)}
              </Section>
            ) : null}
          </>
        )}
        <AppText variant="caption" tone="secondary">
          {t('nearby.hint')}
        </AppText>
      </View>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.container}>
        <BackButton />
        <AppText variant="title">{t('nearby.title')}</AppText>
        {content}
      </View>
    </Screen>
  );
}

function PlaceRow({ place: p }: { place: Nearby }) {
  const { colors } = useTheme();
  const details = [p.cuisine, priceLabel(p.price_level), p.address ?? p.city].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/place/[id]', params: { id: p.id } })}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{p.name}</AppText>
        {details ? (
          <AppText variant="caption" tone="secondary" numberOfLines={1}>
            {details}
          </AppText>
        ) : null}
      </View>
      <AppText variant="bodyStrong" tone="primary">
        {formatDistance(p.meters)}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  content: { gap: spacing.lg },
  radius: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  flex: { flex: 1, gap: spacing.xs },
});
