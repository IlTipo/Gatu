import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { invokeExtract } from '@/features/sources/api';
import { supabase } from '@/lib/supabase';

import type { DietPlan } from './types';

const key = (uid?: string) => ['diet-plan', uid] as const;

/** Il mio piano alimentare (null se non l'ho ancora caricato). */
export function useDietPlan() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: key(uid),
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from('diet_plans').select('title, days, notes').maybeSingle();
      if (error) throw error;
      return (data as DietPlan | null) ?? null;
    },
  });
}

export function useSaveDietPlan() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (plan: DietPlan) => {
      const { error } = await supabase
        .from('diet_plans')
        .upsert({ title: plan.title, days: plan.days, notes: plan.notes }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: (_d, plan) => queryClient.setQueryData(key(session?.user.id), plan),
  });
}

export function useDeleteDietPlan() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('diet_plans').delete().eq('user_id', session?.user.id ?? '');
      if (error) throw error;
    },
    onSuccess: () => queryClient.setQueryData(key(session?.user.id), null),
  });
}

export type DietFile = { base64: string; mimeType: string; name: string; bytes: number };
export type DietReadResult =
  | { status: 'done'; plan: DietPlan }
  | { status: 'not_plan' }
  | { status: 'skipped'; reason: 'not_configured' | 'quota_exceeded' }
  | { status: 'error'; reason: string };

/** Foto/PDF e/o testo → piano letto dall'AI (si salva solo dopo averlo controllato). */
export function useReadDietPlan() {
  return useMutation({
    mutationFn: (input: { files: DietFile[]; text: string }) =>
      invokeExtract<DietReadResult>({
        action: 'diet_plan_read',
        files: input.files.map((f) => ({ data: f.base64, mimeType: f.mimeType })),
        text: input.text,
      }),
  });
}

export const MAX_PDF_BYTES = 6 * 1024 * 1024;

/** Sceglie un PDF dal telefono o dal computer (sul sito). null se annullato. */
export function pickPdf(): Promise<DietFile | null> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(null);
      if (file.type !== 'application/pdf') return reject(Object.assign(new Error('not pdf'), { code: 'invalid_pdf' }));
      if (file.size > MAX_PDF_BYTES) return reject(Object.assign(new Error('too large'), { code: 'too_large' }));
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = String(reader.result).replace(/^data:[^,]+,/, '');
        resolve({ base64, mimeType: 'application/pdf', name: file.name, bytes: file.size });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });
    document.body.appendChild(input);
    input.click();
  });
}
