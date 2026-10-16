import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/features/sources/api';
import { supabase } from '@/lib/supabase';

import type { RecipeDraft, RecipeWithDetails } from './types';

export const recipeKeys = {
  all: ['recipes'] as const,
  detail: (id: string) => ['recipes', id] as const,
};

export function useRecipe(id: string) {
  return useQuery({
    queryKey: recipeKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('*, recipe_ingredients(*), recipe_steps(*), sources(url, platform)')
        .eq('id', id)
        .order('position', { referencedTable: 'recipe_ingredients' })
        .order('position', { referencedTable: 'recipe_steps' })
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new ApiError('not_found');
      return data as RecipeWithDetails;
    },
  });
}

export function useUpdateRecipe(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: RecipeDraft) => {
      const { error } = await supabase.rpc('update_recipe', { p_recipe_id: id, p_recipe: draft });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recipeKeys.all });
      queryClient.invalidateQueries({ queryKey: ['source-results'] });
    },
  });
}

export type DoseResult =
  | { recipeId: string; status: 'done'; changed: number; servings: number | null }
  | { recipeId: string; status: 'nothing_to_do' }
  | { recipeId: string; status: 'skipped'; reason: 'not_configured' | 'quota_exceeded' }
  | { recipeId: string; status: 'error'; reason: string };

/** Chiede al server di stimare (con l'AI) le dosi che mancano. */
export function useEstimateDoses(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<DoseResult>('extract', {
        body: { action: 'estimate_doses', recipeId: id },
      });
      if (error || !data) throw new ApiError(error?.name === 'FunctionsFetchError' ? 'network' : 'internal_error');
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recipeKeys.detail(id) }),
  });
}
