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
