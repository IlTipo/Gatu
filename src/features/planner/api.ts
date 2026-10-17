import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import { addDays, type Slot } from './dates';
import { nextPosition } from './helpers';
import type { MealEntry, NewMeal } from './types';

export const plannerKeys = {
  all: ['meal-plan'] as const,
  week: (monday: string) => ['meal-plan', monday] as const,
};

const COLUMNS = 'id, date, slot, recipe_id, servings, position, created_at';

/** I pasti dal lunedì alla domenica. */
export function useWeekPlan(monday: string) {
  return useQuery({
    queryKey: plannerKeys.week(monday),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meal_plan_entries')
        .select(COLUMNS)
        .gte('date', monday)
        .lte('date', addDays(monday, 6))
        .order('date')
        .order('position');
      if (error) throw error;
      return data as MealEntry[];
    },
  });
}

/** Aggiunge una ricetta a un pasto (in fondo a quelle già presenti). */
export function useAddMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (meal: NewMeal) => {
      const { data: same, error: readError } = await supabase
        .from('meal_plan_entries')
        .select(COLUMNS)
        .eq('date', meal.date)
        .eq('slot', meal.slot);
      if (readError) throw readError;
      const { error } = await supabase.from('meal_plan_entries').insert({
        date: meal.date,
        slot: meal.slot,
        recipe_id: meal.recipeId,
        servings: meal.servings,
        position: nextPosition((same ?? []) as MealEntry[], meal.date, meal.slot),
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: plannerKeys.all }),
  });
}

/** Cambia porzioni o sposta un pasto in un altro giorno/momento. */
export function useUpdateMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<{ date: string; slot: Slot; servings: number }> }) => {
      const { error } = await supabase.from('meal_plan_entries').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: plannerKeys.all }),
  });
}

export function useRemoveMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('meal_plan_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: plannerKeys.all }),
  });
}

/** Copia i pasti della settimana prima in questa (stessi giorni della settimana). */
export function useCopyPreviousWeek(monday: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const previous = addDays(monday, -7);
      const { data, error } = await supabase
        .from('meal_plan_entries')
        .select(COLUMNS)
        .gte('date', previous)
        .lte('date', addDays(previous, 6));
      if (error) throw error;
      const rows = (data as MealEntry[]).map((e) => ({
        date: addDays(e.date, 7),
        slot: e.slot,
        recipe_id: e.recipe_id,
        servings: e.servings,
        position: e.position,
      }));
      if (!rows.length) return 0;
      const { error: insertError } = await supabase.from('meal_plan_entries').insert(rows);
      if (insertError) throw insertError;
      return rows.length;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: plannerKeys.all }),
  });
}

/** Toglie tutti i pasti della settimana (le ricette restano nella Libreria). */
export function useClearWeek(monday: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('meal_plan_entries')
        .delete()
        .gte('date', monday)
        .lte('date', addDays(monday, 6));
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: plannerKeys.all }),
  });
}
