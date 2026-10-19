import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Platform, Share } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import type { MyProfile } from '@/features/social/api';
import { invokeExtract } from '@/features/sources/api';
import { supabase } from '@/lib/supabase';

import { TERMS_VERSION } from './content';

/** Salva "ho letto e accetto Termini e Privacy (e ho almeno 14 anni)" con data e versione. */
export async function acceptTerms() {
  const { error } = await supabase.rpc('accept_terms', { p_version: TERMS_VERSION });
  if (error) throw error;
}

export function useAcceptTerms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: acceptTerms,
    onSuccess: () => {
      // subito nel profilo in memoria, così le schede si aprono senza tornare qui
      queryClient.setQueriesData<MyProfile>({ queryKey: ['my-profile'] }, (old) =>
        old ? { ...old, terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION } : old,
      );
      return queryClient.invalidateQueries({ queryKey: ['my-profile'] });
    },
  });
}

/** Tabelle con i miei dati (ognuno legge solo le proprie righe). */
const MY_TABLES = [
  'profiles', 'sources', 'recipes', 'recipe_ingredients', 'recipe_steps', 'places', 'collections', 'collection_items',
  'meal_plan_entries', 'shopping_items', 'food_log', 'cook_log', 'feedback', 'friendships', 'follows', 'recipe_likes',
  'recipe_comments', 'notifications', 'comment_reports', 'blocks', 'usage_counters', 'diet_plans', 'notification_settings',
] as const;

/** "Scarica i miei dati": tutto in un file JSON (portabilità, art. 20 GDPR). */
export function useExportMyData() {
  const { session } = useAuth();
  return useMutation({
    mutationFn: async () => {
      const data: Record<string, unknown> = {
        exported_at: new Date().toISOString(),
        account: { id: session?.user.id, email: session?.user.email, created_at: session?.user.created_at },
      };
      for (const table of MY_TABLES) {
        const rows: unknown[] = [];
        for (let from = 0; ; from += 1000) {
          const { data: page, error } = await supabase.from(table).select('*').range(from, from + 999);
          if (error) throw error;
          rows.push(...(page ?? []));
          if (!page || page.length < 1000) break;
        }
        data[table] = rows;
      }
      const json = JSON.stringify(data, null, 2);
      const name = `morso-dati-${new Date().toISOString().slice(0, 10)}.json`;
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      } else {
        await Share.share({ title: name, message: json });
      }
    },
  });
}

/** "Elimina account": cancella per sempre account, dati, foto e video, poi esce. */
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await invokeExtract<{ status: 'deleted' }>({ action: 'delete_account', confirm: 'ELIMINA' });
      queryClient.clear();
      // l'account non c'è più: basta dimenticare l'accesso su questo dispositivo
      await supabase.auth.signOut({ scope: 'local' });
    },
  });
}
