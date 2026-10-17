import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { PlacesMap } from '@/components/PlacesMap';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/StateViews';
import { useLibraryPlaces } from '@/features/library/api';
import { cityCounts, normalize } from '@/features/library/filter';
import { mappable } from '@/features/map/logic';
import { usePlacesWithLocation } from '@/features/places/api';
import { errorMessage } from '@/lib/errors';
import { type Coords, getCurrentCoords } from '@/lib/location';
import { spacing, useTheme } from '@/theme';

export default function MapScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const located = usePlacesWithLocation();
  const all = useLibraryPlaces();
  const [wishlistOnly, setWishlistOnly] = useState(false);
  const [city, setCity] = useState<string | null>(null);
  const [me, setMe] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<unknown>(null);
  const [focus, setFocus] = useState(0);

  const points = useMemo(() => mappable(located.data ?? []), [located.data]);
  const visible = useMemo(
    () =>
      points.filter((p) => (!wishlistOnly || p.wishlist) && (!city || normalize(p.city ?? '') === normalize(city))),
    [points, wishlistOnly, city],
  );
  const cities = useMemo(() => cityCounts(points).slice(0, 10), [points]);
  const missing = Math.max(0, (all.data?.length ?? 0) - points.length);
  const wished = points.filter((p) => p.wishlist).length;
  const focusKey = `${wishlistOnly}-${city}-${visible.length}-${focus}`;

  async function locate() {
    setLocating(true);
    setLocationError(null);
    try {
      setMe(await getCurrentCoords());
      setFocus((f) => f + 1);
    } catch (e) {
      setLocationError(e);
    } finally {
      setLocating(false);
    }
  }

  let body;
  if (located.isPending) body = <LoadingState />;
  else if (located.isError) body = <ErrorState message={errorMessage(located.error, t)} onRetry={() => located.refetch()} />;
  else if (!points.length)
    body = (
      <EmptyState
        icon={<Icon name={{ ios: 'map', android: 'map' }} size={32} color={colors.primary} />}
        title={t('map.emptyTitle')}
        body={missing ? `${t('map.missing', { count: missing })} ${t('map.missingAction')}` : t('map.emptyBody')}
      />
    );
  else
    body = (
      <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipBar} contentContainerStyle={styles.chips}>
          <Chip
            label={t('map.all', { count: points.length })}
            selected={!wishlistOnly && !city}
            onPress={() => {
              setWishlistOnly(false);
              setCity(null);
            }}
          />
          {wished ? (
            <Chip label={t('map.wishlist', { count: wished })} selected={wishlistOnly} onPress={() => setWishlistOnly((v) => !v)} />
          ) : null}
          {cities.length > 1
            ? cities.map(({ value, count }) => (
                <Chip
                  key={value}
                  label={`${value} · ${count}`}
                  selected={city === value}
                  onPress={() => setCity((c) => (c === value ? null : value))}
                />
              ))
            : null}
        </ScrollView>
        <View style={styles.map}>
          <PlacesMap
            places={visible}
            me={me}
            onOpen={(id) => router.push({ pathname: '/place/[id]', params: { id } })}
            openLabel={t('map.open')}
            focusKey={focusKey}
          />
        </View>
        <View style={styles.footer}>
          <View style={styles.buttons}>
            <View style={styles.flex}>
              <Button label={locating ? t('map.locating') : t('map.whereAmI')} variant="secondary" onPress={locate} loading={locating} />
            </View>
            <View style={styles.flex}>
              <Button label={t('map.showAll')} variant="ghost" onPress={() => setFocus((f) => f + 1)} />
            </View>
          </View>
          <InlineError message={locationError ? errorMessage(locationError, t) : null} />
          {!visible.length ? <AppText tone="secondary">{t('map.noneInFilter')}</AppText> : null}
          <AppText variant="caption" tone="secondary">
            {t('map.legend')}
            {missing ? ` · ${t('map.missing', { count: missing })}` : ''}
          </AppText>
        </View>
      </>
    );

  return (
    <Screen>
      <BackButton />
      <AppText variant="title" style={styles.title}>
        {t('map.title')}
      </AppText>
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.sm },
  chipBar: { flexGrow: 0, flexShrink: 0, marginBottom: spacing.sm },
  chips: { gap: spacing.sm, paddingRight: spacing.md },
  map: { flex: 1, minHeight: 300 },
  footer: { gap: spacing.xs, paddingTop: spacing.sm },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
