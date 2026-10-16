import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import { type CollectionRow, groupCollections, type ItemRow } from './helpers';
import type { Collection, CollectionDraft, CollectionTarget } from './types';

export { collectionsContaining } from './helpers';

export const collectionKeys = { all: ['collections'] as const };

/** Le collezioni dell'utente, con cosa contengono. */
export function useCollections() {
  return useQuery({
    queryKey: collectionKeys.all,
    queryFn: async () => {
      const [collections, items] = await Promise.all([
        supabase
          .from('collections')
          .select('id, name, emoji, position, created_at, rules')
          .order('position')
          .order('created_at'),
        supabase.from('collection_items').select('collection_id, recipe_id, place_id').limit(10_000),
      ]);
      if (collections.error) throw collections.error;
      if (items.error) throw items.error;
      return groupCollections(collections.data as CollectionRow[], items.data as ItemRow[]);
    },
  });
}

/** Crea una collezione (in fondo all'elenco); se c'è "target", ci mette subito dentro quell'elemento. */
export function useCreateCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ draft, target, position }: { draft: CollectionDraft; target?: CollectionTarget; position: number }) => {
      const { data, error } = await supabase
        .from('collections')
        .insert({ name: draft.name.trim(), emoji: draft.emoji, rules: draft.rules ?? null, position })
        .select('id')
        .single();
      if (error) throw error;
      const id = (data as { id: string }).id;
      if (target) await addItem(id, target);
      return id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.all }),
  });
}

export function useUpdateCollection(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: CollectionDraft) => {
      const { error } = await supabase.from('collections').update({ name: draft.name.trim(), emoji: draft.emoji, rules: draft.rules ?? null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.all }),
  });
}

/** Elimina la collezione (ricette e posti restano nella Libreria). */
export function useDeleteCollection(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('collections').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.all }),
  });
}

async function addItem(collectionId: string, target: CollectionTarget) {
  const row = 'recipeId' in target ? { recipe_id: target.recipeId } : { place_id: target.placeId };
  const { error } = await supabase.from('collection_items').insert({ collection_id: collectionId, ...row });
  // 23505 = era già dentro: va bene così
  if (error && error.code !== '23505') throw error;
}

/** Mette o toglie una ricetta/un posto da una collezione. */
export function useToggleCollectionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ collectionId, target, add }: { collectionId: string; target: CollectionTarget; add: boolean }) => {
      if (add) return addItem(collectionId, target);
      const query = supabase.from('collection_items').delete().eq('collection_id', collectionId);
      const { error } = await ('recipeId' in target ? query.eq('recipe_id', target.recipeId) : query.eq('place_id', target.placeId));
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.all }),
  });
}

/** Nuovo ordine delle collezioni (la prima va in cima). Aggiorna subito lo schermo, poi salva. */
export function useReorderCollections() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc('reorder_collections', { p_ids: ids });
      if (error) throw error;
    },
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: collectionKeys.all });
      const previous = queryClient.getQueryData<Collection[]>(collectionKeys.all);
      if (previous) {
        const byId = new Map(previous.map((c) => [c.id, c]));
        queryClient.setQueryData(
          collectionKeys.all,
          ids.map((id, position) => ({ ...byId.get(id)!, position })).filter((c) => c.id),
        );
      }
      return { previous };
    },
    onError: (_e, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(collectionKeys.all, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: collectionKeys.all }),
  });
}
