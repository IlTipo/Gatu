import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { usePlace } from '@/features/places/api';
import { googleMapsUrl, priceLabel } from '@/features/places/format';
import { errorMessage } from '@/lib/errors';
import { openExternalUrl } from '@/lib/openUrl';
import { radius, spacing, useTheme } from '@/theme';

export default function PlaceScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
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

  const p = place.data;
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
          </View>
        </View>

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

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  image: { width: '100%', aspectRatio: 16 / 9, maxHeight: 320, borderRadius: radius.lg, overflow: 'hidden' },
  titleBlock: { gap: spacing.xs },
  address: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, alignItems: 'flex-start' },
  buttons: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1, gap: spacing.xs },
});
