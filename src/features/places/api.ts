import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/features/sources/api';
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
