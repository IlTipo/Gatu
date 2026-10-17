import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

import { cleanPrefs, type PortionPrefs } from './logic';

export type Goals = { kcal_goal: number | null; protein_goal: number | null; carbs_goal: number | null; fat_goal: number | null };
export type ProfileSettings = Goals & { portions: PortionPrefs };

const settingsKey = ['profile-settings'] as const;

/** Porzioni preferite e obiettivi giornalieri (salvati nel profilo, uguali su tutti i dispositivi). */
export function useProfileSettings() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: [...settingsKey, uid],
    enabled: !!uid,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ProfileSettings> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('portions, kcal_goal, protein_goal, carbs_goal, fat_goal')
        .eq('id', uid!)
        .maybeSingle();
      if (error) throw error;
      return {
        portions: cleanPrefs(data?.portions),
        kcal_goal: data?.kcal_goal ?? null,
        protein_goal: data?.protein_goal ?? null,
        carbs_goal: data?.carbs_goal ?? null,
        fat_goal: data?.fat_goal ?? null,
      };
    },
  });
}

/** Solo le porzioni (vuoto finché non sono caricate: le ricette restano come sono). */
export function usePortionPrefs(): PortionPrefs {
  const settings = useProfileSettings();
  return useMemo(() => settings.data?.portions ?? {}, [settings.data]);
}

export function useUpdateProfileSettings() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  const key = [...settingsKey, uid];
  return useMutation({
    mutationFn: async (patch: Partial<ProfileSettings>) => {
      if (!uid) throw new Error('not signed in');
      const { error } = await supabase.from('profiles').update(patch).eq('id', uid);
      if (error) throw error;
    },
    // si aggiorna subito sullo schermo; se il salvataggio fallisce torna com'era
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ProfileSettings>(key);
      if (previous) queryClient.setQueryData(key, { ...previous, ...patch });
      return { previous };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
