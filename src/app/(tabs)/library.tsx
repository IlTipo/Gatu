import { router } from 'expo-router';
import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { DiceModal } from '@/components/DiceModal';
import { Icon } from '@/components/Icon';
import { FadeIn, PressableScale } from '@/components/Motion';
import { TodayReminder } from '@/components/TodayReminder';
import { PlaceCard } from '@/components/PlaceCard';
import { RecipeCard } from '@/components/RecipeCard';
import { Screen } from '@/components/Screen';
import { SearchBar } from '@/components/SearchBar';
import { SourceCard } from '@/components/SourceCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { useCollections } from '@/features/collections/api';
import { resolveCollection } from '@/features/collections/helpers';
import type { Collection } from '@/features/collections/types';
import type { ItemStatus } from '@/features/recipes/types';
import { useLibraryPlaces, useLibraryRecipes } from '@/features/library/api';
import { cityCounts, filterPlaces, filterRecipes, matchesQuery } from '@/features/library/filter';
import { useSources } from '@/features/sources/api';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

type Tab = 'recipes' | 'places' | 'links';

export default function LibraryScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const columns = width >= 700 ? 3 : 2;

  const recipes = useLibraryRecipes();
  const places = useLibraryPlaces();
  const sources = useSources();
  const collections = useCollections();

  const [tab, setTab] = useState<Tab>('recipes');
  const [query, setQuery] = useState('');
  const [city, setCity] = useState<string | null>(null);
  const [wishlistOnly, setWishlistOnly] = useState(false);
  const [status, setStatus] = useState<ItemStatus | null>(null);
  const [minRating, setMinRating] = useState<number | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);

  const [diceOpen, setDiceOpen] = useState(false);

  const collection = collections.data?.find((c) => c.id === collectionId) ?? null;
  // automatiche: il contenuto si calcola dalle regole
  const scope = useMemo(
    () => (collection ? resolveCollection(collection, recipes.data ?? [], places.data ?? []) : null),
    [collection, recipes.data, places.data],
  );
  const countFor = (c: Collection) => {
    const r = resolveCollection(c, recipes.data ?? [], places.data ?? []);
    return r.recipeIds.length + r.placeIds.length;
  };

  const visibleRecipes = useMemo(
    () => filterRecipes(recipes.data ?? [], { query, tags: [], collection: scope, status, minRating }),
    [recipes.data, query, scope, status, minRating],
  );
  const visiblePlaces = useMemo(
    () => filterPlaces(places.data ?? [], { query, wishlistOnly, city, collection: scope, status, minRating }),
    [places.data, query, wishlistOnly, city, scope, status, minRating],
  );
  const visibleSources = useMemo(
    () => (sources.data ?? []).filter((s) => matchesQuery([s.title, s.author_name, s.url, s.description], query)),
    [sources.data, query],
  );

  // le etichette e le città proposte sono quelle presenti (nella collezione scelta, se c'è)
  const cityOptions = useMemo(
    () => cityCounts(filterPlaces(places.data ?? [], { query: '', wishlistOnly: false, city: null, collection: scope })),
    [places.data, scope],
  );

  const goToAdd = () => router.push('/add');
  const filtersActive = !!query.trim() || !!city || wishlistOnly || !!status || !!minRating;
  function clearFilters() {
    setQuery('');
    setCity(null);
    setWishlistOnly(false);
    setStatus(null);
    setMinRating(null);
  }

  const active = tab === 'recipes' ? recipes : tab === 'places' ? places : sources;
  const libraryEmpty = recipes.data?.length === 0 && places.data?.length === 0 && sources.data?.length === 0;

  let content;
  if (libraryEmpty) {
    content = (
      <EmptyState
        icon={<Icon name={{ ios: 'book', android: 'menu_book' }} size={32} color={colors.primary} />}
        title={t('library.emptyTitle')}
        body={t('library.emptyBody')}
        action={<Button label={t('library.emptyAction')} onPress={goToAdd} />}
      />
    );
  } else if (active.isError) {
    content = <ErrorState message={errorMessage(active.error, t)} onRetry={() => active.refetch()} />;
  } else if (active.isPending) {
    content = <LoadingState />;
  } else {
    const count = tab === 'recipes' ? visibleRecipes.length : tab === 'places' ? visiblePlaces.length : visibleSources.length;
    const header = (
      <View style={styles.listHeader}>
        {tab !== 'links' ? (
          <CollectionsRow
            collections={collections.data ?? []}
            countFor={countFor}
            selected={collectionId}
            onSelect={(id) => {
              setCollectionId(id);
                        setCity(null);
            }}
          />
        ) : null}
        {collection ? (
          <Pressable
            onPress={() => router.push({ pathname: '/collection/[id]', params: { id: collection.id } })}
            accessibilityRole="button">
            <AppText variant="caption" tone="primary">
              ✏️ {t('library.editCollection')}
            </AppText>
          </Pressable>
        ) : null}

        {tab === 'recipes' ? (
          <ChipRow>
            <Chip label={t('library.writeRecipe')} onPress={() => router.push('/recipe/new')} />
            <Chip label={t('library.friendsRecipes')} onPress={() => router.push('/friends-recipes')} />
            <Chip label={t('library.diceButton')} onPress={() => setDiceOpen(true)} />
          </ChipRow>
        ) : null}
        {tab === 'places' ? (
          <>
            <View style={styles.placeButtons}>
              <View style={styles.flex}>
                <Button label={t('nearby.button')} variant="secondary" onPress={() => router.push('/nearby')} />
              </View>
              <View style={styles.flex}>
                <Button label={t('library.openMap')} variant="secondary" onPress={() => router.push('/map')} />
              </View>
            </View>
            <ChipRow>
              <Chip label={t('library.wishlistOnly')} selected={wishlistOnly} onPress={() => setWishlistOnly((v) => !v)} />
              {cityOptions.map(({ value, count: n }) => (
                <Chip
                  key={value}
                  label={`${value} · ${n}`}
                  selected={city === value}
                  onPress={() => setCity((old) => (old === value ? null : value))}
                />
              ))}
            </ChipRow>
          </>
        ) : null}

        {tab !== 'links' ? (
          <ChipRow>
            <Chip
              label={t('library.toTryFilter')}
              selected={status === 'to_try'}
              onPress={() => setStatus((s) => (s === 'to_try' ? null : 'to_try'))}
            />
            <Chip
              label={tab === 'recipes' ? t('library.triedFilter') : t('library.visitedFilter')}
              selected={status === 'tried'}
              onPress={() => setStatus((s) => (s === 'tried' ? null : 'tried'))}
            />
            <Chip label={t('library.topRated')} selected={minRating === 4} onPress={() => setMinRating((m) => (m ? null : 4))} />
          </ChipRow>
        ) : null}
        {query.trim().length >= 2 && tab !== 'links' ? (
          <Button
            label={t('library.askAi', { q: query.trim().slice(0, 40) })}
            variant="secondary"
            onPress={() => router.push({ pathname: '/ask', params: { q: query.trim() } })}
          />
        ) : null}
        {filtersActive ? (
          <View style={styles.resultsRow}>
            <AppText variant="caption" tone="secondary">
              {t('library.count', { count })}
            </AppText>
            <Pressable onPress={clearFilters} accessibilityRole="button">
              <AppText variant="caption" tone="primary">
                {t('library.clearFilters')}
              </AppText>
            </Pressable>
          </View>
        ) : null}
      </View>
    );

    const empty = filtersActive ? (
      <EmptyState
        title={t('library.noResults')}
        body={t('library.noResultsBody')}
        action={<Button label={t('library.clearFilters')} variant="secondary" onPress={clearFilters} />}
      />
    ) : collection && tab !== 'links' ? (
      <EmptyState title={t('library.emptyCollection')} body={t('library.emptyCollectionBody')} />
    ) : tab === 'recipes' ? (
      <EmptyState title={t('library.noRecipes')} body={t('library.noRecipesBody')} />
    ) : (
      <EmptyState title={t('library.noPlaces')} body={t('library.noPlacesBody')} />
    );

    const common = {
      numColumns: columns,
      columnWrapperStyle: styles.row,
      contentContainerStyle: styles.list,
      ListHeaderComponent: header,
      ListEmptyComponent: empty,
      keyboardShouldPersistTaps: 'handled' as const,
      keyboardDismissMode: 'on-drag' as const,
    };
    // cambiando tab o colonne la lista va ricreata
    const listKey = `${tab}-${columns}`;
    // le schede entrano una dopo l'altra, con dolcezza
    const cell = (child: ReactNode, index: number) => (
      <FadeIn index={index} style={{ flex: 1 / columns }}>
        {child}
      </FadeIn>
    );

    content =
      tab === 'recipes' ? (
        <FlatList
          key={listKey}
          {...common}
          data={visibleRecipes}
          keyExtractor={(item) => item.id}
          refreshing={recipes.isRefetching}
          onRefresh={() => recipes.refetch()}
          renderItem={({ item, index }) =>
            cell(<RecipeCard recipe={item} onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: item.id } })} />, index)
          }
        />
      ) : tab === 'places' ? (
        <FlatList
          key={listKey}
          {...common}
          data={visiblePlaces}
          keyExtractor={(item) => item.id}
          refreshing={places.isRefetching}
          onRefresh={() => places.refetch()}
          renderItem={({ item, index }) =>
            cell(<PlaceCard place={item} onPress={() => router.push({ pathname: '/place/[id]', params: { id: item.id } })} />, index)
          }
        />
      ) : (
        <FlatList
          key={listKey}
          {...common}
          data={visibleSources}
          keyExtractor={(item) => item.id}
          refreshing={sources.isRefetching}
          onRefresh={() => sources.refetch()}
          renderItem={({ item, index }) =>
            cell(<SourceCard source={item} onPress={() => router.push({ pathname: '/source/[id]', params: { id: item.id } })} />, index)
          }
        />
      );
  }

  const tabs: { key: Tab; label: string; count: number | undefined }[] = [
    { key: 'recipes', label: t('library.recipesTab'), count: recipes.data?.length },
    { key: 'places', label: t('library.placesTab'), count: places.data?.length },
    { key: 'links', label: t('library.linksTab'), count: sources.data?.length },
  ];

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">{t('library.title')}</AppText>
        <Button
          label={t('library.add')}
          onPress={goToAdd}
          icon={<Icon name={{ ios: 'plus', android: 'add' }} size={20} color={colors.onPrimary} />}
        />
      </View>
      <View style={styles.shortcuts}>
        <Shortcut emoji="📅" title={t('tabs.planner')} hint={t('library.plannerHint')} onPress={() => router.push('/planner')} />
        <Shortcut emoji="🛒" title={t('tabs.shopping')} hint={t('library.shoppingHint')} onPress={() => router.push('/shopping')} />
        <Shortcut emoji="🥗" title={t('diet.shortTitle')} hint={t('library.dietHint')} onPress={() => router.push('/diet')} />
      </View>
      <TodayReminder />
      {libraryEmpty ? null : (
        <View style={styles.controls}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder={t('library.searchPlaceholder')}
            label={t('library.search')}
            clearLabel={t('library.clearSearch')}
          />
          <View style={[styles.segments, { backgroundColor: colors.surfaceMuted }]} accessibilityRole="tablist">
            {tabs.map((s) => {
              const selected = tab === s.key;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => setTab(s.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  style={[styles.segment, selected && { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <AppText variant="bodyStrong" tone={selected ? 'default' : 'secondary'} numberOfLines={1}>
                    {s.label}
                    {s.count !== undefined ? ` · ${s.count}` : ''}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
      {content}
      {diceOpen ? <DiceModal recipes={visibleRecipes} onClose={() => setDiceOpen(false)} /> : null}
    </Screen>
  );
}

/** Scorciatoia grande a Planner e Spesa (non sono più schede in basso). */
function Shortcut({ emoji, title, hint, onPress }: { emoji: string; title: string; hint: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[styles.shortcut, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <AppText variant="heading">{emoji}</AppText>
      <AppText variant="bodyStrong" numberOfLines={1}>
        {title}
      </AppText>
      <AppText variant="caption" tone="secondary" numberOfLines={1}>
        {hint}
      </AppText>
    </PressableScale>
  );
}

function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {children}
    </ScrollView>
  );
}

/** "Tutto", le collezioni e "+ Nuova collezione". */
function CollectionsRow({
  collections,
  countFor,
  selected,
  onSelect,
}: {
  collections: Collection[];
  countFor: (c: Collection) => number;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <ChipRow>
      <Chip label={t('library.all')} selected={selected === null} onPress={() => onSelect(null)} />
      {collections.map((c) => (
        <Chip
          key={c.id}
          label={`${c.emoji ?? '📁'} ${c.name}${c.rules ? ` ${t('library.auto')}` : ''} · ${countFor(c)}`}
          selected={selected === c.id}
          onPress={() => onSelect(selected === c.id ? null : c.id)}
        />
      ))}
      <Chip label={t('library.newCollection')} onPress={() => router.push({ pathname: '/collection/[id]', params: { id: 'new' } })} />
      {collections.length > 1 ? <Chip label={t('library.reorder')} onPress={() => router.push('/collections')} /> : null}
    </ChipRow>
  );
}

const styles = StyleSheet.create({
  placeButtons: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  controls: { gap: spacing.md, marginBottom: spacing.md },
  segments: { flexDirection: 'row', borderRadius: radius.md, padding: 3, gap: 3 },
  shortcuts: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  shortcut: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md - 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  list: { gap: spacing.md, paddingBottom: spacing.xl },
  row: { gap: spacing.md },
  listHeader: { gap: spacing.md },
  chipRow: { gap: spacing.sm, paddingRight: spacing.md },
  resultsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
