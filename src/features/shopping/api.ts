import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { invokeExtract } from '@/features/sources/api';
import { supabase } from '@/lib/supabase';

import { aisleFor, rememberAisle } from './aisles';
import { guessAisle } from './build';

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

export type NewItem = { name: string; quantity?: number | null; unit?: string | null };

/** Aggiunge cose a mano ("latte, pane e uova" → tre voci) o lette da una foto (con le quantità). */
export function useAddManualItems(monday: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ items, position }: { items: NewItem[]; position: number }) => {
      const rows = items.map((item, i) => ({
        week_start: monday,
        name: item.name.slice(0, 200),
        quantity: item.quantity ?? null,
        unit: item.quantity ? (item.unit ?? null) : null,
        aisle: aisleFor(item.name, guessAisle(item.name)),
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

type Skipped = { status: 'skipped'; reason: 'not_configured' | 'quota_exceeded' };
type Failed = { status: 'error'; reason: string };
export type ShoppingScanResult = { status: 'done'; items: { name: string; quantity: number | null; unit: string | null }[] } | Skipped | Failed;

/** Foto di una lista della spesa (foglietto, nota del telefono…) → voci lette dall'AI, da confermare. */
export function useShoppingScan() {
  return useMutation({
    mutationFn: (photo: { base64: string; mimeType: string }) =>
      invokeExtract<ShoppingScanResult>({ action: 'shopping_scan', imageBase64: photo.base64, mimeType: photo.mimeType }),
  });
}

// ------------------------------------------------------------------ copia e lista fissa

export type TemplateItem = { id: string; name: string; quantity: number | null; unit: string | null; aisle: string; position: number };
const templateKey = ['shopping-template'] as const;

/** Copia la lista di una settimana in un'altra (non spuntata, senza doppioni). */
export function useCopyWeek() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      const { data, error } = await supabase.rpc('copy_shopping_week', { p_from: from, p_to: to });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (_n, { to }) => queryClient.invalidateQueries({ queryKey: shoppingKeys.week(to) }),
  });
}

/** Le voci della lista fissa (si aggiungono da sole a ogni settimana nuova). */
export function useShoppingTemplate() {
  return useQuery({
    queryKey: templateKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopping_template_items')
        .select('id, name, quantity, unit, aisle, position')
        .order('position');
      if (error) throw error;
      return (data as TemplateItem[]).map((i) => ({ ...i, quantity: i.quantity === null ? null : Number(i.quantity) }));
    },
  });
}

/** Salva la lista della settimana come lista fissa (sostituisce quella di prima). */
export function useSaveTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (monday: string) => {
      const { data, error } = await supabase.rpc('save_shopping_template', { p_week: monday });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateKey }),
  });
}

export function useAddTemplateItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ names, position }: { names: string[]; position: number }) => {
      const rows = names.map((name, i) => ({ name: name.slice(0, 200), aisle: aisleFor(name, guessAisle(name)), position: Math.min(32000, position + i) }));
      const { error } = await supabase.from('shopping_template_items').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateKey }),
  });
}

/** Toglie una voce (id) o tutta la lista fissa (null). */
export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string | null) => {
      const query = supabase.from('shopping_template_items').delete();
      const { error } = id ? await query.eq('id', id) : await query.not('id', 'is', null);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateKey }),
  });
}

/** Aggiunge la lista fissa alla settimana (una volta sola; dalla settimana corrente in poi). */
export async function applyTemplate(monday: string): Promise<number> {
  const { data, error } = await supabase.rpc('apply_shopping_template', { p_week: monday });
  if (error) throw error;
  return (data as number) ?? 0;
}

/** Svuota tutta la lista di una settimana. */
export function useClearWeek(monday: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('shopping_items').delete().eq('week_start', monday);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shoppingKeys.week(monday) }),
  });
}

/** Cancella le liste di tutte le settimane dopo "monday" (es. quelle copiate o della lista fissa). */
export function useClearFutureWeeks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (monday: string) => {
      const { data, error } = await supabase.from('shopping_items').delete().gt('week_start', monday).select('id');
      if (error) throw error;
      return data?.length ?? 0;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shoppingKeys.all }),
  });
}
