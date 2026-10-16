// Strumenti per i test: un finto "internet" e un finto Supabase, così i test non usano la rete.
import type { FetchLike } from '../_shared/metadata.ts';

type Route = { status?: number; headers?: Record<string, string>; body?: string | Uint8Array<ArrayBuffer> };

export function fakeFetch(routes: Record<string, Route | (() => Route)>) {
  const calls: string[] = [];
  const impl: FetchLike = (input) => {
    calls.push(input);
    const entry = routes[input];
    if (!entry) {
      return Promise.resolve(new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } }));
    }
    const route = typeof entry === 'function' ? entry() : entry;
    return Promise.resolve(
      new Response(route.body ?? null, { status: route.status ?? 200, headers: route.headers ?? {} }),
    );
  };
  return { fetch: impl, calls };
}

export const html = (body: string): Route => ({ headers: { 'content-type': 'text/html; charset=utf-8' }, body });
export const jsonRoute = (data: unknown): Route => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
});
export const redirect = (location: string): Route => ({ status: 301, headers: { location } });

/** Finto client Supabase: tiene le righe di "sources" in memoria e registra le chiamate rpc. */
export function fakeSupabase(
  opts: { userId?: string | null; rows?: Record<string, unknown>[]; quotaAllowed?: boolean; saveFails?: boolean } = {},
) {
  const rows = opts.rows ?? [];
  const uploads: string[] = [];
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const statusHistory: string[] = [];
  const client = {
    auth: {
      getUser: (token: string) =>
        Promise.resolve(
          opts.userId && token
            ? { data: { user: { id: opts.userId } }, error: null }
            : { data: { user: null }, error: { message: 'invalid' } },
        ),
    },
    from(_table: string) {
      let filter: (r: Record<string, unknown>) => boolean = () => true;
      let pendingInsert: Record<string, unknown> | null = null;
      let pendingUpdate: Record<string, unknown> | null = null;
      const applyUpdate = () => {
        if (!pendingUpdate) return;
        for (const r of rows.filter(filter)) {
          Object.assign(r, pendingUpdate);
          if (typeof pendingUpdate.status === 'string') statusHistory.push(pendingUpdate.status);
        }
        pendingUpdate = null;
      };
      const q = {
        select: () => q,
        in: (col: string, values: unknown[]) => ((filter = (r) => values.includes(r[col])), q),
        eq: (col: string, value: unknown) => ((filter = (r) => r[col] === value), q),
        limit: () => q,
        insert: (row: Record<string, unknown>) => ((pendingInsert = row), q),
        update: (patch: Record<string, unknown>) => ((pendingUpdate = patch), q),
        maybeSingle: () => Promise.resolve({ data: rows.find(filter) ?? null, error: null }),
        single: () => {
          if (pendingUpdate) {
            applyUpdate();
            return Promise.resolve({ data: rows.find(filter) ?? null, error: null });
          }
          if (!pendingInsert) return Promise.resolve({ data: null, error: { message: 'nothing' } });
          if (rows.some((r) => r.url === pendingInsert!.url)) {
            return Promise.resolve({ data: null, error: { code: '23505' } });
          }
          const row = { id: crypto.randomUUID(), user_id: opts.userId, ...pendingInsert };
          rows.push(row);
          return Promise.resolve({ data: row, error: null });
        },
        // "await supabase.from(...).update(...).eq(...)" senza select
        then: (resolve: (v: unknown) => void) => {
          applyUpdate();
          resolve({ data: null, error: null });
        },
      };
      return q;
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      if (name === 'consume_extraction_quota') return Promise.resolve({ data: opts.quotaAllowed ?? true, error: null });
      if (name === 'save_extraction') {
        if (opts.saveFails) return Promise.resolve({ data: null, error: { message: 'boom' } });
        const row = rows.find((r) => r.id === args.p_source_id);
        if (row) {
          row.status = args.p_status;
          row.ai_result = args.p_ai_result;
          statusHistory.push(String(args.p_status));
        }
        const result = args.p_result as { kind: string; places: unknown[] };
        return Promise.resolve({
          data: {
            recipe_id: result.kind === 'recipe' ? 'recipe-1' : null,
            place_ids: result.places.map((_, i) => `place-${i + 1}`),
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: { message: `rpc ${name} sconosciuta` } });
    },
    storage: {
      from: (_bucket: string) => ({
        upload: (path: string) => (uploads.push(path), Promise.resolve({ data: { path }, error: null })),
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/images/${path}` },
        }),
      }),
    },
  };
  return { client, rows, uploads, rpcCalls, statusHistory };
}
