import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, invokeExtract } from '@/features/sources/api';
import { supabase } from '@/lib/supabase';

import type { RecipeDraft, RecipeVariant, RecipeWithDetails, VariantKind } from './types';

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
    mutationFn: () => invokeExtract<DoseResult>({ action: 'estimate_doses', recipeId: id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recipeKeys.detail(id) }),
  });
}

type Skipped = { status: 'skipped'; reason: 'not_configured' | 'quota_exceeded' };
type Failed = { status: 'error'; reason: string };

export type InsightsResult = { status: 'done' } | Skipped | Failed;

/** Calcola calorie e valori per porzione, difficoltà e costo (stime AI). */
export function useRecipeInsights(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => invokeExtract<InsightsResult>({ action: 'recipe_insights', recipeId: id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recipeKeys.detail(id) }),
  });
}

export type VariantResult = { status: 'done'; variant: RecipeVariant } | Skipped | Failed;

/** Variante proposta dall'AI: si chiede una volta sola e resta in memoria finché non la salvi. */
export function useRecipeVariant(id: string, kind: VariantKind) {
  return useQuery({
    queryKey: ['recipe-variant', id, kind],
    queryFn: () => invokeExtract<VariantResult>({ action: 'recipe_variant', recipeId: id, kind }),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
  });
}

/** Salva una ricetta nuova (es. la variante) e restituisce il suo id. */
export function useCreateRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: Omit<RecipeDraft, 'servings_estimated'> & { image_url: string | null }) => {
      const { data, error } = await supabase.rpc('create_recipe', { p_recipe: draft });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recipeKeys.all }),
  });
}

export type VideoResult = { status: 'done'; changed: string[] } | Skipped | Failed;

/** Procedimento (e dosi) dal video: carica il video nella cartella privata, poi lo fa leggere all'AI. */
export function useRecipeFromVideo(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ videoPath }: { videoPath: string }) =>
      invokeExtract<VideoResult>({ action: 'recipe_video', recipeId: id, videoPath }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recipeKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: recipeKeys.all });
    },
  });
}
