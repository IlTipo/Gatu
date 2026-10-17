import { Platform } from 'react-native';

import { currentPlatform, isStandalone } from '@/features/install/device';
import { supabase } from '@/lib/supabase';

// Notifiche push del sito (Web Push). Su iPhone funzionano solo dall'app aggiunta alla schermata Home.

export type PushState = 'on' | 'off' | 'denied' | 'unsupported' | 'needs-install';

const INTRO_KEY = 'morso.pushIntro.seen';

export function pushSupported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready;
}

/** Stato delle notifiche su questo dispositivo. */
export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return currentPlatform() === 'ios' && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  const sub = await (await registration()).pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Chiede il permesso e iscrive questo dispositivo. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return pushState();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const { data: key, error: keyError } = await supabase.rpc('push_public_key');
  if (keyError) throw keyError;
  if (!key) throw Object.assign(new Error('push not configured'), { code: 'not_configured' });
  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key as string) }));
  const json = sub.toJSON();
  const { error } = await supabase.rpc('register_push', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
  });
  if (error) throw error;
  // il fuso orario serve per mandare i promemoria all'ora giusta
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (timezone) await supabase.from('notification_settings').upsert({ timezone }, { onConflict: 'user_id' });
  return 'on';
}

/** Spegne le notifiche su questo dispositivo (anche prima di uscire dall'account). */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const sub = await (await registration()).pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe().catch(() => false);
}

/** La schermata "Vuoi le notifiche?" si mostra una volta sola, se il permesso non è ancora stato chiesto. */
export function shouldShowPushIntro(): boolean {
  if (!pushSupported() || Notification.permission !== 'default') return false;
  try {
    return globalThis.localStorage?.getItem(INTRO_KEY) !== '1';
  } catch {
    return false;
  }
}

export function markPushIntroSeen() {
  try {
    globalThis.localStorage?.setItem(INTRO_KEY, '1');
  } catch {
    // niente da fare
  }
}
