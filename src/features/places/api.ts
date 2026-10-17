import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, invokeExtract } from '@/features/sources/api';
import { supabase } from '@/lib/supabase';

import type { Place, PlaceDraft } from './types';

export const placeKeys = {
  all: ['places'] as const,
  detail: (id: string) => ['places', id] as const,
};

export function usePlace(id: string) {
  return useQuery({
    queryKey: placeKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('places').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) throw new ApiError('not_found');
      return data as Place;
    },
  });
}

export function useUpdatePlace(place: Place) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: PlaceDraft) => {
      // Se cambia l'indirizzo, la posizione sulla mappa non è più verificata.
      const moved = draft.address !== place.address || draft.city !== place.city;
      const patch = moved ? { ...draft, latitude: null, longitude: null, google_place_id: null, verified: false } : draft;
      const { error } = await supabase.from('places').update(patch).eq('id', place.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: placeKeys.all });
      queryClient.invalidateQueries({ queryKey: ['source-results'] });
    },
  });
}

/** "Voglio andarci": aggiunge o toglie il locale dalla lista desideri. */
export function useSetWishlist(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (wishlist: boolean) => {
      const { error } = await supabase.from('places').update({ wishlist }).eq('id', id);
      if (error) throw error;
      return wishlist;
    },
    onSuccess: (wishlist) => {
      queryClient.setQueryData<Place>(placeKeys.detail(id), (old) => (old ? { ...old, wishlist } : old));
      queryClient.invalidateQueries({ queryKey: placeKeys.all });
    },
  });
}

export type RefreshPlaceResult = { status: 'done' | 'not_found' } | { status: 'error'; reason: string };

/** Cerca di nuovo indirizzo, posizione, telefono, sito e orari del locale. */
export function useRefreshPlace(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => invokeExtract<RefreshPlaceResult>({ action: 'refresh_place', placeId: id }),
    // anche le liste (Vicino a me, mappa): il locale può aver appena trovato la sua posizione
    onSuccess: () => queryClient.invalidateQueries({ queryKey: placeKeys.all }),
  });
}

/** I locali salvati che non hanno ancora una posizione sulla mappa. */
export function usePlacesWithoutLocation() {
  return useQuery({
    queryKey: [...placeKeys.all, 'without-location'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('places')
        .select('*')
        .or('latitude.is.null,longitude.is.null')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as Place[];
    },
  });
}

/** Tutti i locali con una posizione (per "Vicino a me"). */
export function usePlacesWithLocation() {
  return useQuery({
    queryKey: [...placeKeys.all, 'with-location'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('places')
        .select('*')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(1000);
      if (error) throw error;
      return data as Place[];
    },
  });
}
