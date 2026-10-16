import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import type { Place } from '../places/types';
import type { Recipe } from '../recipes/types';
import type { SaveLinkResult, Source } from './types';

export const sourcesKeys = {
  all: ['sources'] as const,
  detail: (id: string) => ['sources', id] as const,
};

/** Errore con un codice stabile restituito dalla Edge Function (es. "invalid_url"). */
export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'ApiError';
  }
}

/** Chiama la funzione del server "extract" e trasforma i suoi errori in ApiError con un codice. */
export async function invokeExtract<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('extract', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = await (error.context as Response).json().catch(() => null);
      throw new ApiError(typeof res?.error === 'string' ? res.error : 'internal_error');
    }
    // FunctionsFetchError / FunctionsRelayError: rete assente o funzione non raggiungibile
    throw new ApiError(error.name === 'FunctionsFetchError' ? 'network' : 'function_unavailable');
  }
  if (!data) throw new ApiError('internal_error');
  return data;
}

type ExtractInput =
  | { url: string; text?: string }
  | { sourceId: string; text?: string }
  | { imageBase64: string; mimeType: string; text?: string };

/** Salva un link nuovo ({ url }), rianalizza un link salvato ({ sourceId }) o legge una foto ({ imageBase64 }). */
async function callExtract(input: ExtractInput): Promise<SaveLinkResult> {
  const data = await invokeExtract<SaveLinkResult>(input);
  if (!data.source) throw new ApiError('internal_error');
  return data;
}

function useExtractMutation<T extends Parameters<typeof callExtract>[0]>() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: T) => callExtract(input),
    onSuccess: (result) => {
      queryClient.setQueryData(sourcesKeys.detail(result.source.id), result.source);
      // ricette, locali e link possono essere cambiati: si ricaricano alla prossima visita
      queryClient.invalidateQueries({ queryKey: sourcesKeys.all });
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      queryClient.invalidateQueries({ queryKey: ['places'] });
      queryClient.invalidateQueries({ queryKey: ['source-results', result.source.id] });
    },
  });
}

/** Salva un link nuovo e lo fa analizzare dall'AI. */
export const useSaveLink = () => useExtractMutation<{ url: string; text?: string }>();

/** Rianalizza un link già salvato (eventualmente con il testo del post incollato a mano). */
export const useReanalyze = () => useExtractMutation<{ sourceId: string; text?: string }>();

/** Salva la foto di una ricetta (base64 JPEG/PNG/WebP) e la fa leggere all'AI. */
export const useSavePhoto = () => useExtractMutation<{ imageBase64: string; mimeType: string; text?: string }>();

/** Ricette e locali estratti da un link. */
export function useSourceResults(sourceId: string) {
  return useQuery({
    queryKey: ['source-results', sourceId],
    queryFn: async () => {
      const [recipes, places] = await Promise.all([
        supabase.from('recipes').select('id, title, image_url, total_minutes, tags').eq('source_id', sourceId),
        supabase.from('places').select('id, name, city, cuisine, verified').eq('source_id', sourceId).order('created_at'),
      ]);
      if (recipes.error) throw recipes.error;
      if (places.error) throw places.error;
      return {
        recipes: recipes.data as Pick<Recipe, 'id' | 'title' | 'image_url' | 'total_minutes' | 'tags'>[],
        places: places.data as Pick<Place, 'id' | 'name' | 'city' | 'cuisine' | 'verified'>[],
      };
    },
  });
}

export function useSources() {
  return useQuery({
    queryKey: sourcesKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as Source[];
    },
  });
}

export function useSource(id: string) {
  return useQuery({
    queryKey: sourcesKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('sources').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) throw new ApiError('not_found');
      return data as Source;
    },
  });
}

export function useDeleteSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sources').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.removeQueries({ queryKey: sourcesKeys.detail(id) });
      queryClient.setQueryData<Source[]>(sourcesKeys.all, (old) => old?.filter((s) => s.id !== id));
    },
  });
}
