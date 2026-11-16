import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { shareLink, siteUrl } from '@/lib/share';
import { supabase } from '@/lib/supabase';

import { recipeKeys } from './api';

export type PublicRecipe = {
  title: string;
  description: string | null;
  image_url: string | null;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  tags: string[];
  kcal_per_serving: number | null;
  homemade: boolean;
  source: { platform: string; url: string; author_name: string | null } | null;
  ingredients: { quantity: number | null; unit: string | null; name: string; note: string | null }[];
  steps: { text: string; timer_seconds: number | null }[];
};

export const publicRecipeUrl = (token: string) => `${siteUrl()}/r/${token}`;

/** Crea (o riprende) il link pubblico della ricetta e lo condivide (WhatsApp, Messaggi…) o lo copia. */
export async function shareRecipeLink(recipeId: string, title: string) {
  const { data, error } = await supabase.rpc('share_recipe_link', { p_recipe: recipeId });
  if (error) throw error;
  const url = publicRecipeUrl(data as string);
  const result = await shareLink({ title, text: `🍽️ ${title} — la ricetta su Morso:`, url });
  return { url, result };
}

export function useShareRecipeLink(recipeId: string, title: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => shareRecipeLink(recipeId, title),
    onSettled: () => queryClient.invalidateQueries({ queryKey: recipeKeys.detail(recipeId) }),
  });
}

/** Il link smette di funzionare per tutti. */
export function useUnshareRecipeLink(recipeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('unshare_recipe_link', { p_recipe: recipeId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recipeKeys.detail(recipeId) }),
  });
}

/** La ricetta di un link pubblico (si apre anche senza account). */
export function usePublicRecipe(token: string | undefined) {
  return useQuery({
    queryKey: ['public-recipe', token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('public_recipe', { p_token: token });
      if (error) throw error;
      return (data as PublicRecipe | null) ?? null;
    },
  });
}
