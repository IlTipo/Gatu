// Edge Function "extract" — Fase 1: salva un link con i suoi metadati pubblici.
// (Nella Fase 2 qui verrà aggiunta l'estrazione della ricetta/dei locali con Claude.)
//
// Richiesta:  POST { url?: string, text?: string }   (basta uno dei due: il link viene cercato anche nel testo)
// Risposta:   { source, duplicate, needsText }

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

import { corsHeaders, errorResponse, json } from '../_shared/http.ts';
import { extractUrl, normalizeUrl } from '../_shared/links.ts';
import { type FetchLike, fetchLinkMetadata, safeFetch, UnsafeUrlError } from '../_shared/metadata.ts';

export type Deps = {
  /** Crea un client Supabase che agisce come l'utente della richiesta (rispetta le regole RLS). */
  supabaseForRequest: (req: Request) => SupabaseClient | null;
  fetch: FetchLike;
};

const MAX_TEXT_LENGTH = 10_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  const supabase = deps.supabaseForRequest(req);
  if (!supabase) return errorResponse('unauthorized', 401);
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return errorResponse('unauthorized', 401);

  let body: { url?: unknown; text?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 400);
  }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT_LENGTH) : '';
  const rawUrl = (typeof body.url === 'string' && body.url.trim()) || extractUrl(text);
  const normalized = rawUrl ? normalizeUrl(rawUrl) : null;
  if (!normalized) return errorResponse('invalid_url', 400);

  let meta;
  try {
    meta = await fetchLinkMetadata(normalized, deps.fetch);
  } catch (e) {
    if (e instanceof UnsafeUrlError) return errorResponse('invalid_url', 400);
    throw e;
  }

  // Già salvato? (lo stesso link, una volta ripulito, ha sempre lo stesso indirizzo)
  const { data: existing, error: existingError } = await supabase
    .from('sources')
    .select('*')
    .in('url', [...new Set([meta.url, normalized])])
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return json({ source: existing, duplicate: true, needsText: false });

  const thumbnailUrl = meta.thumbnailUrl
    ? await copyThumbnail(meta.thumbnailUrl, user.id, supabase, deps.fetch).catch(() => meta.thumbnailUrl)
    : null;

  const sharedText = text && text !== rawUrl ? text : null;
  const { data: source, error: insertError } = await supabase
    .from('sources')
    .insert({
      url: meta.url,
      platform: meta.platform,
      title: meta.title,
      description: meta.description,
      author_name: meta.author,
      thumbnail_url: thumbnailUrl,
      shared_text: sharedText,
      status: 'pending',
    })
    .select('*')
    .single();
  if (insertError) {
    // doppio clic: l'altra richiesta l'ha appena salvato
    if (insertError.code === '23505') {
      const { data: again } = await supabase.from('sources').select('*').eq('url', meta.url).maybeSingle();
      if (again) return json({ source: again, duplicate: true, needsText: false });
    }
    throw insertError;
  }

  return json({ source, duplicate: false, needsText: meta.needsText && !sharedText }, 201);
}

/**
 * Copia la miniatura nel nostro storage: i link delle miniature di TikTok/Instagram scadono
 * dopo qualche giorno, la copia invece resta. Se qualcosa va storto si usa il link originale.
 */
async function copyThumbnail(
  url: string,
  userId: string,
  supabase: SupabaseClient,
  fetchImpl: FetchLike,
): Promise<string> {
  const res = await safeFetch(url, fetchImpl, { headers: { accept: 'image/*' } });
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const ext = IMAGE_TYPES[type];
  const declaredSize = Number(res.headers.get('content-length') ?? 0);
  if (!res.ok || !ext || declaredSize > MAX_IMAGE_BYTES) {
    await res.body?.cancel();
    return url;
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) return url;

  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('images').upload(path, bytes, { contentType: type, upsert: false });
  if (error) return url;
  return supabase.storage.from('images').getPublicUrl(path).data.publicUrl;
}
