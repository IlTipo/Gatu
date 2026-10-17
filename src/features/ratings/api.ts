import { useMutation, useQueryClient } from '@tanstack/react-query';

import { placeKeys } from '@/features/places/api';
import { recipeKeys } from '@/features/recipes/api';
import type { ItemStatus } from '@/features/recipes/types';
import { supabase } from '@/lib/supabase';

export type MetaPatch = Partial<{ status: ItemStatus; rating: number | null; notes: string | null; done_at: string | null }>;

/**
 * Salva stato, voto, note e data ("cucinata"/"visitato") di una ricetta o di un posto.
 * Lo schermo si aggiorna subito; se il salvataggio fallisce torna com'era.
 */
export function useUpdateMeta(kind: 'recipe' | 'place', id: string) {
  const queryClient = useQueryClient();
  const table = kind === 'recipe' ? 'recipes' : 'places';
  const dateColumn = kind === 'recipe' ? 'last_cooked_at' : 'visited_at';
  const key = kind === 'recipe' ? recipeKeys.detail(id) : placeKeys.detail(id);
  const toRow = ({ done_at, ...rest }: MetaPatch) => ({ ...rest, ...(done_at !== undefined ? { [dateColumn]: done_at } : {}) });

  return useMutation({
    mutationFn: async (patch: MetaPatch) => {
      const { error } = await supabase.from(table).update(toRow(patch)).eq('id', id);
      if (error) throw error;
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old: Record<string, unknown> | undefined) => (old ? { ...old, ...toRow(patch) } : old));
      return { previous };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      // le card della Libreria mostrano stelle e stato
      queryClient.invalidateQueries({ queryKey: kind === 'recipe' ? recipeKeys.all : placeKeys.all });
    },
  });
}
