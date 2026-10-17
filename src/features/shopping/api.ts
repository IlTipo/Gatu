import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { addDays } from '@/features/planner/dates';
import { usePortionPrefs } from '@/features/portions/api';
import { personalize } from '@/features/portions/logic';
import { supabase } from '@/lib/supabase';

import { aisleFor, rememberAisle } from './aisles';
import { buildShoppingList, guessAisle, ingredientKey, type PlannedMeal, type PlannedRecipe } from './build';

export type ShoppingItem = {
  id: string;
  week_start: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  aisle: string;
  checked: boolean;
  is_manual: boolean;
  recipe_ids: string[];
  position: number;
};

export const shoppingKeys = {
  all: ['shopping'] as const,
  week: (monday: string) => ['shopping', monday] as const,
};

export function useShoppingList(monday: string) {
  return useQuery({
    queryKey: shoppingKeys.week(monday),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopping_items')
        .select('id, week_start, name, quantity, unit, aisle, checked, is_manual, recipe_ids, position')
        .eq('week_start', monday)
        .order('position');
      if (error) throw error;
      return (data as ShoppingItem[]).map((i) => ({ ...i, quantity: i.quantity === null ? null : Number(i.quantity) }));
    },
  });
}

const lineKey = (name: string, unit: string | null) => `${ingredientKey(name)}|${unit ?? ''}`;

/**
 * Crea (o aggiorna) la lista dai pasti della settimana.
 * Le spunte delle voci che restano uguali si conservano; le voci aggiunte a mano non si toccano.
 */
export function useGenerateList(monday: string) {
  const queryClient = useQueryClient();
  const prefs = usePortionPrefs();
  return useMutation({
    mutationFn: async (current: ShoppingItem[]) => {
      const { data: meals, error } = await supabase
        .from('meal_plan_entries')
        .select('recipe_id, servings')
        .gte('date', monday)
        .lte('date', addDays(monday, 6));
      if (error) throw error;
      const ids = [...new Set((meals as PlannedMeal[]).map((m) => m.recipe_id))];
      let recipes: PlannedRecipe[] = [];
      if (ids.length) {
        const res = await supabase
          .from('recipes')
          .select('id, title, servings, recipe_ingredients(name, quantity, unit, aisle)')
          .in('id', ids);
        if (res.error) throw res.error;
        recipes = (res.data as (Omit<PlannedRecipe, 'ingredients'> & { recipe_ingredients: PlannedRecipe['ingredients'] })[]).map(
          (r) => ({
            id: r.id,
            title: r.title,
            servings: r.servings,
            // con le porzioni preferite del Profilo (es. pasta 100 g a persona)
            ingredients: personalize(
              r.recipe_ingredients.map((i) => ({ ...i, quantity: i.quantity === null ? null : Number(i.quantity) })),
              r.servings,
              prefs,
            ).ingredients,
          }),
        );
      }
      const lines = buildShoppingList(meals as PlannedMeal[], recipes);
      const checked = new Set(current.filter((i) => !i.is_manual && i.checked).map((i) => lineKey(i.name, i.unit)));
      const items = lines.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        unit: l.unit,
        // il reparto che hai scelto tu per questo ingrediente, se c'è
        aisle: aisleFor(l.name, l.aisle),
        recipe_ids: l.recipe_ids,
        checked: checked.has(lineKey(l.name, l.unit)),
      }));
      const { error: saveError } = await supabase.rpc('replace_shopping_list', { p_week_start: monday, p_items: items });
      if (saveError) throw saveError;
      return { items: items.length, meals: (meals as PlannedMeal[]).length };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shoppingKeys.week(monday) }),
  });
}

/** Spunta o toglie la spunta (subito a schermo, poi salva). */
export function useToggleItem(monday: string) {
  const queryClient = useQueryClient();
  const key = shoppingKeys.week(monday);
  return useMutation({
    mutationFn: async ({ id, checked }: { id: string; checked: boolean }) => {
      const { error } = await supabase.from('shopping_items').update({ checked }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, checked }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ShoppingItem[]>(key);
      queryClient.setQueryData<ShoppingItem[]>(key, (old) => old?.map((i) => (i.id === id ? { ...i, checked } : i)));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** Aggiunge cose a mano: "latte, pane e uova" → tre voci. */
export function useAddManualItems(monday: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ names, position }: { names: string[]; position: number }) => {
      const rows = names.map((name, i) => ({
        week_start: monday,
        name: name.slice(0, 200),
        aisle: aisleFor(name, guessAisle(name)),
        is_manual: true,
        position: Math.min(32000, position + i),
      }));
      const { error } = await supabase.from('shopping_items').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shoppingKeys.week(monday) }),
  });
}

export function useDeleteItem(monday: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('shopping_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shoppingKeys.week(monday) }),
  });
}

/** Toglie dalla lista le cose già prese. */
export function useClearChecked(monday: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('shopping_items').delete().eq('week_start', monday).eq('checked', true);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shoppingKeys.week(monday) }),
  });
}

/** Sposta una voce in un altro reparto e se lo ricorda per le prossime liste. */
export function useMoveToAisle(monday: string) {
  const queryClient = useQueryClient();
  const key = shoppingKeys.week(monday);
  return useMutation({
    mutationFn: async ({ id, aisle }: { id: string; name: string; aisle: string }) => {
      const { error } = await supabase.from('shopping_items').update({ aisle }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, name, aisle }) => {
      rememberAisle(name, aisle);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ShoppingItem[]>(key);
      queryClient.setQueryData<ShoppingItem[]>(key, (old) => old?.map((i) => (i.id === id ? { ...i, aisle } : i)));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
