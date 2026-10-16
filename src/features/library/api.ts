import { useQuery } from '@tanstack/react-query';

import { placeKeys } from '@/features/places/api';
import { recipeKeys } from '@/features/recipes/api';
import { invokeExtract } from '@/features/sources/api';
import { supabase } from '@/lib/supabase';

import type { LibraryPlace, LibraryRecipe } from './filter';

/** Tutte le ricette per la Libreria (con i nomi degli ingredienti, per la ricerca). */
export function useLibraryRecipes() {
  return useQuery({
    queryKey: [...recipeKeys.all, 'library'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select(
          'id, title, description, image_url, total_minutes, tags, kcal_per_serving, difficulty, created_at, recipe_ingredients(name)',
        )
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as LibraryRecipe[];
    },
  });
}

/** Tutti i posti per la Libreria. */
export function useLibraryPlaces() {
  return useQuery({
    queryKey: [...placeKeys.all, 'library'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('places')
        .select('id, name, city, address, cuisine, price_level, recommended_dishes, image_url, wishlist, verified, created_at')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as LibraryPlace[];
    },
  });
}

export type AskItem = { type: 'recipe' | 'place'; id: string; reason: string | null };
export type AskResult =
  | { status: 'done'; message: string | null; items: AskItem[] }
  | { status: 'empty' }
  | { status: 'skipped'; reason: 'not_configured' | 'quota_exceeded' }
  | { status: 'error'; reason: string };

/** "Chiedi all'AI": la stessa domanda non si ripete (resta in memoria per mezz'ora). */
export function useAskLibrary(question: string) {
  return useQuery({
    queryKey: ['ask-library', question],
    queryFn: () => invokeExtract<AskResult>({ action: 'ask_library', question }),
    enabled: question.trim().length >= 2,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
  });
}
