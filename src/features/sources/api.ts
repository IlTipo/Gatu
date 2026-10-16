import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

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

async function saveLink(input: { url: string; text?: string }): Promise<SaveLinkResult> {
  const { data, error } = await supabase.functions.invoke<SaveLinkResult>('extract', { body: input });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await (error.context as Response).json().catch(() => null);
      throw new ApiError(typeof body?.error === 'string' ? body.error : 'internal_error');
    }
    // FunctionsFetchError / FunctionsRelayError: rete assente o funzione non raggiungibile
    throw new ApiError(error.name === 'FunctionsFetchError' ? 'network' : 'function_unavailable');
  }
  if (!data?.source) throw new ApiError('internal_error');
  return data;
}

export function useSaveLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveLink,
    onSuccess: (result) => {
      queryClient.setQueryData(sourcesKeys.detail(result.source.id), result.source);
      queryClient.invalidateQueries({ queryKey: sourcesKeys.all });
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
