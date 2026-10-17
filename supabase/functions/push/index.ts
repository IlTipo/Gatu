import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

import type { VapidKeys } from '../_shared/webpush.ts';
import { handlePush } from './handler.ts';

// Agisce come server (chiave di servizio, mai nel sito): legge le chiavi e i dispositivi di tutti.
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function setting(key: string): Promise<string | null> {
  const { data } = await admin.from('app_settings').select('value').eq('key', key).maybeSingle();
  return (data?.value as string | undefined) ?? null;
}

Deno.serve(async (req) => {
  try {
    return await handlePush(req, {
      fetch,
      cronSecret: () => setting('cron_secret'),
      async vapid(): Promise<VapidKeys | null> {
        const [publicKey, privateKey, subject] = await Promise.all([
          setting('vapid_public'),
          setting('vapid_private_jwk'),
          setting('vapid_subject'),
        ]);
        if (!publicKey || !privateKey) return null;
        return { publicKey, privateJwk: JSON.parse(privateKey), subject: subject ?? 'https://morsoapp.pages.dev' };
      },
      async due() {
        const { data, error } = await admin.rpc('push_due');
        if (error) throw error;
        return data ?? [];
      },
      async devices(userIds) {
        const { data, error } = await admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', userIds);
        if (error) throw error;
        return data ?? [];
      },
      async removeDevices(ids) {
        await admin.from('push_subscriptions').delete().in('id', ids);
      },
    });
  } catch (e) {
    console.error('push failed', e);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
  }
});
