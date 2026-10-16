import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { ErrorState, InlineError, LoadingState } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { usePlace, useUpdatePlace } from '@/features/places/api';
import { parseDishes, priceLabel } from '@/features/places/format';
import type { Place } from '@/features/places/types';
import { errorMessage } from '@/lib/errors';
import { spacing } from '@/theme';

export default function EditPlaceScreen() {
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
  return <PlaceForm place={place.data} />;
}

function PlaceForm({ place }: { place: Place }) {
  const { t } = useTranslation();
  const update = useUpdatePlace(place);
  const [name, setName] = useState(place.name);
  const [city, setCity] = useState(place.city ?? '');
  const [address, setAddress] = useState(place.address ?? '');
  const [cuisine, setCuisine] = useState(place.cuisine ?? '');
  const [price, setPrice] = useState<number | null>(place.price_level);
  const [dishes, setDishes] = useState(place.recommended_dishes.join(', '));
  const [nameError, setNameError] = useState<string | null>(null);

  function save() {
    if (!name.trim()) {
      setNameError(t('place.nameRequired'));
      return;
    }
    setNameError(null);
    update.mutate(
      {
        name: name.trim(),
        city: city.trim() || null,
        address: address.trim() || null,
        cuisine: cuisine.trim() || null,
        price_level: price,
        recommended_dishes: parseDishes(dishes),
      },
      { onSuccess: () => (router.canGoBack() ? router.back() : router.replace(`/place/${place.id}`)) },
    );
  }

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.container}>
        <BackButton fallback={`/place/${place.id}`} />
        <AppText variant="title">{t('place.editTitle')}</AppText>
        <TextField label={t('place.name')} value={name} onChangeText={setName} error={nameError} />
        <TextField label={t('place.city')} value={city} onChangeText={setCity} />
        <TextField label={t('place.address')} value={address} onChangeText={setAddress} />
        <TextField label={t('place.cuisine')} value={cuisine} onChangeText={setCuisine} />
        <Section title={t('place.price')}>
          <View style={styles.chips}>
            {[1, 2, 3, 4].map((level) => (
              <Chip key={level} label={priceLabel(level)!} selected={price === level} onPress={() => setPrice(price === level ? null : level)} />
            ))}
          </View>
        </Section>
        <TextField label={t('place.dishesLabel')} value={dishes} onChangeText={setDishes} multiline />
        <InlineError message={update.isError ? errorMessage(update.error, t) : null} />
        <Button label={update.isPending ? t('common.saving') : t('common.save')} onPress={save} loading={update.isPending} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
