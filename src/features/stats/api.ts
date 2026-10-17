import { useQuery } from '@tanstack/react-query';

import { addDays } from '@/features/planner/dates';
import { supabase } from '@/lib/supabase';

import type { CookEvent, DayKcal } from './logic';

/** Storico delle ricette cucinate negli ultimi 120 giorni. */
export function useCookLog() {
  return useQuery({
    queryKey: ['cook-log'],
    queryFn: async () => {
      const since = new Date(Date.now() - 120 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from('cook_log')
        .select('recipe_id, cooked_at')
        .gte('cooked_at', since)
        .order('cooked_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data as CookEvent[];
    },
  });
}

/** Calorie del diario degli ultimi 7 giorni. */
export function useWeekKcal(today: string) {
  return useQuery({
    queryKey: ['food-log', 'week', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('food_log')
        .select('eaten_on, kcal')
        .gte('eaten_on', addDays(today, -6))
        .lte('eaten_on', today)
        .limit(1000);
      if (error) throw error;
      return data as DayKcal[];
    },
  });
}
