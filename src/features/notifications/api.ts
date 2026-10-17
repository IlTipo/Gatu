import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { disablePush, enablePush, pushState } from '@/lib/push';
import { supabase } from '@/lib/supabase';

export type NotificationSettings = {
  social: boolean;
  meals: boolean;
  shopping: boolean;
  updates: boolean;
  lunch_time: string; // "11:30:00"
  dinner_time: string;
  shopping_time: string;
  quiet_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  muted_until: string | null;
};

export const DEFAULT_SETTINGS: NotificationSettings = {
  social: true,
  meals: true,
  shopping: true,
  updates: true,
  lunch_time: '11:30:00',
  dinner_time: '18:30:00',
  shopping_time: '17:00:00',
  quiet_enabled: true,
  quiet_start: '22:00:00',
  quiet_end: '08:00:00',
  muted_until: null,
};

const COLUMNS = Object.keys(DEFAULT_SETTINGS).join(', ');

/** Le mie scelte sulle notifiche (quelle di base se non ho ancora cambiato niente). */
export function useNotificationSettings() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['notification-settings', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from('notification_settings').select(COLUMNS).maybeSingle();
      if (error) throw error;
      return { ...DEFAULT_SETTINGS, ...((data as Partial<NotificationSettings> | null) ?? {}) };
    },
  });
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const key = ['notification-settings', session?.user.id];
  return useMutation({
    mutationFn: async (patch: Partial<NotificationSettings>) => {
      const { error } = await supabase.from('notification_settings').upsert(patch, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationSettings>(key);
      if (previous) queryClient.setQueryData(key, { ...previous, ...patch });
      return { previous };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** Notifiche su questo dispositivo: stato e interruttore. */
export function usePushDevice() {
  const queryClient = useQueryClient();
  const state = useQuery({ queryKey: ['push-state'], queryFn: pushState });
  const toggle = useMutation({
    mutationFn: async (on: boolean) => (on ? enablePush() : (await disablePush(), pushState())),
    onSuccess: (next) => queryClient.setQueryData(['push-state'], next),
  });
  return { state, toggle };
}
