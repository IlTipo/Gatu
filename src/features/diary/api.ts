import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { usePortionPrefs } from '@/features/portions/api';
import { personalRecipe } from '@/features/portions/logic';
import { ApiError, invokeExtract } from '@/features/sources/api';
import { supabase } from '@/lib/supabase';

import type { FoodEntry, MealTime } from './logic';

export const diaryKeys = {
  all: ['food-log'] as const,
  day: (date: string) => ['food-log', date] as const,
};

/** Le voci del diario di un giorno ("2026-10-20"). */
export function useDayLog(date: string) {
  return useQuery({
    queryKey: diaryKeys.day(date),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('food_log')
        .select('*')
        .eq('eaten_on', date)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data as FoodEntry[]).map((e) => ({
        ...e,
        protein_g: e.protein_g === null ? null : Number(e.protein_g),
        carbs_g: e.carbs_g === null ? null : Number(e.carbs_g),
        fat_g: e.fat_g === null ? null : Number(e.fat_g),
      }));
    },
  });
}

export type NewFoodEntry = {
  eaten_on: string;
  slot: MealTime;
  name: string;
  kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  source: 'manual' | 'ai' | 'recipe';
  recipe_id?: string | null;
  servings?: number | null;
};

export function useAddFood() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entry: NewFoodEntry) => {
      const { error } = await supabase.from('food_log').insert(entry);
      if (error) throw error;
    },
    onSuccess: (_d, entry) => queryClient.invalidateQueries({ queryKey: diaryKeys.day(entry.eaten_on) }),
  });
}

export function useDeleteFood(date: string) {
  const queryClient = useQueryClient();
  const key = diaryKeys.day(date);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('food_log').delete().eq('id', id);
      if (error) throw error;
    },
    // sparisce subito dallo schermo; se fallisce torna
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<FoodEntry[]>(key);
      queryClient.setQueryData<FoodEntry[]>(key, (old) => old?.filter((e) => e.id !== id));
      return { previous };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/**
 * Mette nel diario UNA porzione di una ricetta salvata, con le calorie già corrette
 * per le tue porzioni (Profilo). Se la ricetta non ha ancora le calorie, errore "no_kcal".
 */
export function useLogRecipe() {
  const queryClient = useQueryClient();
  const prefs = usePortionPrefs();
  return useMutation({
    mutationFn: async ({ recipeId, date, slot, portions = 1 }: { recipeId: string; date: string; slot: MealTime; portions?: number }) => {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, title, servings, kcal_per_serving, protein_g, carbs_g, fat_g, recipe_ingredients(name, quantity, unit)')
        .eq('id', recipeId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new ApiError('not_found');
      const recipe = {
        ...data,
        recipe_ingredients: data.recipe_ingredients.map((i: { name: string; quantity: number | null; unit: string | null }) => ({
          ...i,
          quantity: i.quantity === null ? null : Number(i.quantity),
        })),
      };
      const { nutrition: n } = personalRecipe(recipe, prefs);
      if (n.kcal === null) throw new ApiError('no_kcal');
      const times = (v: number | null) => (v === null ? null : Math.round(v * portions * 10) / 10);
      const { error: insertError } = await supabase.from('food_log').insert({
        eaten_on: date,
        slot,
        name: data.title.slice(0, 200),
        kcal: Math.round(n.kcal * portions),
        protein_g: times(n.protein),
        carbs_g: times(n.carbs),
        fat_g: times(n.fat),
        source: 'recipe',
        recipe_id: recipeId,
        servings: portions,
      });
      if (insertError) throw insertError;
    },
    onSuccess: (_d, v) => queryClient.invalidateQueries({ queryKey: diaryKeys.day(v.date) }),
  });
}

export type FoodEstimate = {
  name: string;
  kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  items: { name: string; grams: number | null; kcal: number | null }[];
};
export type FoodEstimateResult =
  | { status: 'done'; food: FoodEstimate }
  | { status: 'not_food' }
  | { status: 'skipped'; reason: 'not_configured' | 'quota_exceeded' }
  | { status: 'error'; reason: string };

/** "2 uova e una fetta di pane" (o la foto del piatto) → calorie e macro stimate dall'AI. */
export function useEstimateFood() {
  return useMutation({
    mutationFn: (input: { text: string; photo?: { base64: string; mimeType: string } | null }) =>
      invokeExtract<FoodEstimateResult>({
        action: 'estimate_food',
        text: input.text,
        ...(input.photo ? { imageBase64: input.photo.base64, mimeType: input.photo.mimeType } : {}),
      }),
  });
}
