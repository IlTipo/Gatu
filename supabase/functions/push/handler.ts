// Funzione "push": la chiama il database ogni minuto (pg_cron). Prende da push_due() i messaggi
// da mandare adesso e li consegna a tutti i dispositivi di ogni utente.
import { type PushMessage, type PushSubscription, sendPush, type VapidKeys } from '../_shared/webpush.ts';

type Due = PushMessage & { user_id: string };
type Device = PushSubscription & { id: string; user_id: string };

export type PushDeps = {
  /** Segreto condiviso con il database (solo lui può far partire le notifiche). */
  cronSecret: () => Promise<string | null>;
  vapid: () => Promise<VapidKeys | null>;
  due: () => Promise<Due[]>;
  devices: (userIds: string[]) => Promise<Device[]>;
  removeDevices: (ids: string[]) => Promise<void>;
  send?: typeof sendPush;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Confronto a tempo costante (il segreto non si indovina misurando i tempi di risposta). */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function handlePush(req: Request, deps: PushDeps): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const expected = await deps.cronSecret();
  const given = req.headers.get('x-cron-secret') ?? '';
  if (!expected || expected.length < 32 || !sameSecret(given, expected)) return json({ error: 'unauthorized' }, 401);

  const keys = await deps.vapid();
  if (!keys) return json({ error: 'not_configured' }, 503);
  const messages = await deps.due();
  if (!messages.length) return json({ sent: 0 });

  const devices = await deps.devices([...new Set(messages.map((m) => m.user_id))]);
  const send = deps.send ?? sendPush;
  const jobs = messages.flatMap((m) =>
    devices
      .filter((d) => d.user_id === m.user_id)
      .map((d) => ({ device: d, message: { title: m.title, body: m.body, url: m.url, tag: m.tag } })),
  );

  let sent = 0;
  const gone: string[] = [];
  // 10 alla volta: veloce ma senza sommergere i servizi push
  for (let i = 0; i < jobs.length; i += 10) {
    const results = await Promise.all(jobs.slice(i, i + 10).map((j) => send(j.device, j.message, keys, deps.fetch)));
    results.forEach((r, k) => {
      if (r === 'sent') sent++;
      if (r === 'gone') gone.push(jobs[i + k].device.id);
    });
  }
  if (gone.length) await deps.removeDevices([...new Set(gone)]);
  return json({ sent, removed: gone.length });
}
