// Edge Function "extract": salva un link e lo trasforma in ricetta o locali
// (scheda ricetta del sito quando c'è, altrimenti AI Gemini).
//
// Richieste (POST):
//   { url?: string, text?: string }      salva un nuovo link (il link può anche stare dentro "text") e lo analizza
//   { sourceId: string, text?: string }  rianalizza un link già salvato (es. dopo aver incollato la caption)
//   { imageBase64, mimeType, text? }     salva la FOTO di una ricetta (libro, screenshot) e la fa leggere all'AI
//   { action: 'estimate_doses', recipeId }  stima le dosi mancanti di una ricetta salvata
//   { action: 'recipe_insights', recipeId }  calorie e valori per porzione, difficoltà, costo
//   { action: 'recipe_variant', recipeId, kind }  variante vegana / senza glutine / light… (non salvata)
//   { action: 'refresh_place', placeId }  aggiorna indirizzo, telefono, sito e orari di un locale
//   { action: 'recipe_video', recipeId, videoPath }  procedimento e dosi dal video caricato
//   { action: 'fridge_scan', imageBase64, mimeType }  foto del frigo → alimenti
//   { action: 'fridge_recipe', ingredients, servings?, maxMinutes?, avoid? }  ricetta nuova
//   { action: 'ask_library', question }  "Chiedi all'AI": sceglie tra le ricette e i locali salvati
// Risposta: { source, duplicate, needsText, analysis }  ·  per estimate_doses: { recipeId, status, changed, servings }

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

import type { DoseEstimator, Extractor, RecipeTools } from '../_shared/ai.ts';
import { cleanInsights } from '../_shared/insights.ts';
import { isVariantKind } from '../_shared/recipeTools.ts';
import { MAX_QUESTION_LENGTH } from '../_shared/ask.ts';
import {
  askLibrary,
  fridgeRecipe,
  fridgeScan,
  recipeFromVideo,
  recipeInsights,
  recipeVariant,
  refreshPlace,
} from './actions.ts';
import { parseFridgeRequest } from '../_shared/fridge.ts';
import { applyDoseEstimate, type DoseInput, needsDoseEstimate } from '../_shared/doses.ts';
import {
  type CleanExtraction,
  cleanExtraction,
  type ExtractionInput,
  hasEnoughText,
  statusFor,
} from '../_shared/extraction.ts';
import type { Geocoder } from '../_shared/geocode.ts';
import { isItalian, recipeFromJsonLd } from '../_shared/jsonld.ts';
import { corsHeaders, errorResponse, json } from '../_shared/http.ts';
import { extractUrl, normalizeUrl } from '../_shared/links.ts';
import {
  type FetchLike,
  fetchLinkMetadata,
  type LinkMetadata,
  readBytesLimited,
  safeFetch,
  UnsafeUrlError,
} from '../_shared/metadata.ts';

export type Deps = {
  /** Crea un client Supabase che agisce come l'utente della richiesta (rispetta le regole RLS). */
  supabaseForRequest: (req: Request) => SupabaseClient | null;
  fetch: FetchLike;
  /** null se GEMINI_API_KEY non è configurata: si usano solo le schede ricetta dei siti. */
  extractor: Extractor | null;
  /** Stima delle dosi mancanti (stessa chiave dell'AI). */
  doseEstimator: DoseEstimator | null;
  /** Valori/difficoltà/costo e varianti (stessa chiave dell'AI). */
  recipeTools: RecipeTools | null;
  geocoder: Geocoder;
  dailyLimit: number;
  /** Pausa tra una ricerca di indirizzo e l'altra (OpenStreetMap chiede max 1 al secondo). */
  geocodeDelayMs: number;
};

type Source = Record<string, unknown> & {
  id: string;
  url: string;
  platform: string;
  title: string | null;
  description: string | null;
  author_name: string | null;
  shared_text: string | null;
  status: string;
};

export type Analysis =
  | {
    status: 'done' | 'needs_review';
    kind: CleanExtraction['kind'];
    recipeId: string | null;
    placeIds: string[];
    missingInfo: string[];
  }
  | { status: 'skipped'; reason: 'not_configured' | 'needs_text' | 'quota_exceeded' | 'already_done' }
  | { status: 'error'; reason: string };

const MAX_TEXT_LENGTH = 10_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_GEOCODED_PLACES = 10;
const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  const supabase = deps.supabaseForRequest(req);
  if (!supabase) return errorResponse('unauthorized', 401);
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return errorResponse('unauthorized', 401);

  let body: {
    url?: unknown;
    text?: unknown;
    sourceId?: unknown;
    action?: unknown;
    recipeId?: unknown;
    placeId?: unknown;
    kind?: unknown;
    question?: unknown;
    videoPath?: unknown;
    ingredients?: unknown;
    servings?: unknown;
    maxMinutes?: unknown;
    avoid?: unknown;
    imageBase64?: unknown;
    mimeType?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 400);
  }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT_LENGTH) : '';

  // ---- Stima delle dosi mancanti di una ricetta salvata
  if (body.action === 'estimate_doses') {
    if (typeof body.recipeId !== 'string') return errorResponse('invalid_body', 400);
    return json(await estimateDoses(body.recipeId, supabase, deps));
  }

  // ---- Altre azioni su ricette e locali già salvati
  const ctx = {
    supabase,
    recipeTools: deps.recipeTools,
    extractor: deps.extractor,
    geocoder: deps.geocoder,
    dailyLimit: deps.dailyLimit,
    userId: user.id,
  };
  if (body.action === 'recipe_insights') {
    if (typeof body.recipeId !== 'string') return errorResponse('invalid_body', 400);
    return json(await recipeInsights(body.recipeId, ctx));
  }
  if (body.action === 'recipe_variant') {
    if (typeof body.recipeId !== 'string' || !isVariantKind(body.kind)) return errorResponse('invalid_body', 400);
    return json(await recipeVariant(body.recipeId, body.kind, ctx));
  }
  if (body.action === 'refresh_place') {
    if (typeof body.placeId !== 'string') return errorResponse('invalid_body', 400);
    return json(await refreshPlace(body.placeId, ctx));
  }
  if (body.action === 'recipe_video') {
    if (typeof body.recipeId !== 'string' || typeof body.videoPath !== 'string') {
      return errorResponse('invalid_body', 400);
    }
    return json(await recipeFromVideo(body.recipeId, body.videoPath, ctx));
  }
  if (body.action === 'fridge_scan') {
    const image = parsePhoto(body.imageBase64, body.mimeType);
    if (!image) return errorResponse('invalid_image', 400);
    return json(await fridgeScan(image, ctx));
  }
  if (body.action === 'fridge_recipe') {
    const request = parseFridgeRequest(body as Record<string, unknown>);
    if (!request) return errorResponse('invalid_body', 400);
    return json(await fridgeRecipe(request, ctx));
  }
  if (body.action === 'ask_library') {
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (question.length < 2 || question.length > MAX_QUESTION_LENGTH) return errorResponse('invalid_body', 400);
    return json(await askLibrary(question, ctx));
  }

  // ---- Foto di una ricetta
  if (typeof body.imageBase64 === 'string') {
    return await savePhoto(body.imageBase64, body.mimeType, text, user.id, supabase, deps);
  }

  // ---- Rianalisi di un link già salvato
  if (typeof body.sourceId === 'string') {
    const { data: source, error } = await supabase.from('sources').select('*').eq('id', body.sourceId).maybeSingle();
    if (error) throw error;
    if (!source) return errorResponse('not_found', 404);
    let current = source as Source;
    if (text && text !== current.shared_text) {
      const { data: updated, error: updateError } = await supabase
        .from('sources')
        .update({ shared_text: text })
        .eq('id', current.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      current = updated as Source;
    }
    // Per le pagine web rileggiamo la scheda ricetta (non viene salvata nel database).
    const meta = current.platform === 'web' ? await fetchLinkMetadata(current.url, deps.fetch).catch(() => null) : null;
    const analysis = await analyze(current, meta?.recipeJsonLd ?? null, supabase, deps);
    return json({ source: await reload(supabase, current.id), duplicate: false, needsText: false, analysis });
  }

  // ---- Nuovo link
  const rawUrl = (typeof body.url === 'string' && body.url.trim()) || extractUrl(text);
  const normalized = rawUrl ? normalizeUrl(rawUrl) : null;
  if (!normalized) return errorResponse('invalid_url', 400);

  let meta: LinkMetadata;
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
  if (existing) {
    const src = existing as Source;
    // I link salvati prima dell'arrivo dell'AI (o falliti) vengono analizzati adesso.
    const analysis: Analysis = src.status === 'pending' || src.status === 'error'
      ? await analyze(src, meta.recipeJsonLd, supabase, deps)
      : { status: 'skipped', reason: 'already_done' };
    return json({ source: await reload(supabase, src.id), duplicate: true, needsText: false, analysis });
  }

  const thumbnailUrl = meta.thumbnailUrl
    ? await copyThumbnail(meta.thumbnailUrl, user.id, supabase, deps.fetch).catch(() => meta.thumbnailUrl)
    : null;

  const sharedText = text && text !== rawUrl ? text : null;
  const { data: inserted, error: insertError } = await supabase
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
      if (again) {
        return json({
          source: again,
          duplicate: true,
          needsText: false,
          analysis: { status: 'skipped', reason: 'already_done' },
        });
      }
    }
    throw insertError;
  }

  const source = inserted as Source;
  const analysis = await analyze(source, meta.recipeJsonLd, supabase, deps);
  return json(
    {
      source: await reload(supabase, source.id),
      duplicate: false,
      needsText: analysis.status === 'skipped' && analysis.reason === 'needs_text',
      analysis,
    },
    201,
  );
}

/**
 * Capisce cosa contiene il link e salva ricetta o locali. Non lancia errori: li scrive nel link.
 * 1. pagina con scheda ricetta in italiano → lettura diretta, senza AI (gratis, istantanea)
 * 2. altrimenti → AI (Gemini), se configurata
 */
export async function analyze(
  source: Source,
  recipeJsonLd: Record<string, unknown> | null,
  supabase: SupabaseClient,
  deps: Deps,
  image: { mimeType: string; data: string } | null = null,
  /** il limite giornaliero è già stato scalato (foto: si controlla prima di salvarla) */
  quotaPaid = false,
): Promise<Analysis> {
  if (recipeJsonLd) {
    const direct = recipeFromJsonLd(recipeJsonLd);
    // Le schede in altre lingue le facciamo tradurre all'AI, se c'è.
    if (direct?.recipe && (isItalian(recipeJsonLd, source.url) || !deps.extractor)) {
      // Difficoltà e costo (e le calorie, se il sito non le dà) li stima l'AI, se disponibile.
      if (deps.recipeTools && !direct.recipe.insights?.difficulty) {
        const { data: allowed } = await supabase.rpc('consume_extraction_quota', { daily_limit: deps.dailyLimit });
        if (allowed) {
          const outcome = await deps.recipeTools.insights(direct.recipe);
          const ai = outcome.ok ? cleanInsights(outcome.insights) : null;
          if (ai) {
            const site = direct.recipe.insights;
            direct.recipe.insights = site
              ? { ...ai, ...site, difficulty: ai.difficulty, cost_level: ai.cost_level }
              : ai;
          }
        }
      }
      return await saveResult(source, direct, { model: 'schema.org', usage: null }, supabase, deps);
    }
  }

  if (!deps.extractor) return { status: 'skipped', reason: 'not_configured' };

  const input: ExtractionInput = {
    url: source.url,
    platform: source.platform,
    title: source.title,
    description: source.description,
    author: source.author_name,
    sharedText: source.shared_text,
    recipeJsonLd,
    image,
  };
  if (!hasEnoughText(input)) {
    await setStatus(supabase, source.id, 'needs_review', 'needs_text');
    return { status: 'skipped', reason: 'needs_text' };
  }

  if (!quotaPaid) {
    const { data: allowed, error: quotaError } = await supabase.rpc('consume_extraction_quota', {
      daily_limit: deps.dailyLimit,
    });
    if (quotaError) throw quotaError;
    if (!allowed) return { status: 'skipped', reason: 'quota_exceeded' };
  }

  await setStatus(supabase, source.id, 'processing', null);
  const outcome = await deps.extractor(input);
  if (!outcome.ok) {
    await setStatus(supabase, source.id, 'error', `ai_${outcome.reason}`);
    return { status: 'error', reason: outcome.reason };
  }

  return await saveResult(source, cleanExtraction(outcome.extraction), outcome, supabase, deps);
}

async function saveResult(
  source: Source,
  result: CleanExtraction,
  origin: { model: string; usage: { input: number; output: number } | null },
  supabase: SupabaseClient,
  deps: Deps,
): Promise<Analysis> {
  const status = statusFor(result);

  // Verifica dei locali: indirizzo e coordinate per la mappa.
  const places = [];
  for (const [index, place] of result.places.entries()) {
    const geo = index < MAX_GEOCODED_PLACES ? await deps.geocoder(place) : null;
    if (geo?.provider === 'osm' && deps.geocodeDelayMs) await sleep(deps.geocodeDelayMs);
    places.push({
      ...place,
      address: place.address ?? geo?.address ?? null,
      city: place.city ?? geo?.city ?? null,
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
      google_place_id: geo?.googlePlaceId ?? null,
      price_level: place.price_level ?? geo?.priceLevel ?? null,
      phone: geo?.phone ?? null,
      website: geo?.website ?? null,
      opening_hours: geo?.openingHours ?? null,
      verified: !!geo,
    });
  }

  const { data: saved, error: saveError } = await supabase.rpc('save_extraction', {
    p_source_id: source.id,
    p_result: { kind: result.kind, recipe: result.recipe, places },
    p_status: status,
    p_ai_result: {
      model: origin.model,
      kind: result.kind,
      confidence: result.confidence,
      missing_info: result.missingInfo,
      usage: origin.usage,
      extracted_at: new Date().toISOString(),
    },
  });
  if (saveError) {
    console.error('save_extraction failed', saveError);
    await setStatus(supabase, source.id, 'error', 'save_failed');
    return { status: 'error', reason: 'save_failed' };
  }

  const ids = saved as { recipe_id: string | null; place_ids: string[] | null };
  return {
    status,
    kind: result.kind,
    recipeId: ids.recipe_id,
    placeIds: ids.place_ids ?? [],
    missingInfo: result.missingInfo,
  };
}

type RecipeRow = {
  id: string;
  title: string;
  description: string | null;
  servings: number | null;
  servings_estimated: boolean;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  tags: string[];
  recipe_ingredients: {
    position: number;
    quantity: number | null;
    unit: string | null;
    name: string;
    note: string | null;
    aisle: string;
    estimated: boolean;
  }[];
  recipe_steps: { position: number; text: string; timer_seconds: number | null }[];
};

export type DoseResult =
  | { recipeId: string; status: 'done'; changed: number; servings: number | null }
  | { recipeId: string; status: 'nothing_to_do' }
  | { recipeId: string; status: 'skipped'; reason: 'not_configured' | 'quota_exceeded' }
  | { recipeId: string; status: 'error'; reason: string };

/** Chiede all'AI le dosi che mancano e le salva, segnate come "stimate". */
export async function estimateDoses(recipeId: string, supabase: SupabaseClient, deps: Deps): Promise<DoseResult> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_ingredients(*), recipe_steps(*)')
    .eq('id', recipeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { recipeId, status: 'error', reason: 'not_found' };
  const recipe = data as RecipeRow;
  const ingredients = [...recipe.recipe_ingredients].sort((a, b) => a.position - b.position);
  const steps = [...recipe.recipe_steps].sort((a, b) => a.position - b.position);

  const input: DoseInput = {
    title: recipe.title,
    servings: recipe.servings,
    ingredients: ingredients.map((i) => ({
      quantity: i.quantity === null ? null : Number(i.quantity),
      unit: i.unit,
      name: i.name,
      note: i.note,
      estimated: i.estimated,
    })),
    steps: steps.map((s) => s.text),
  };
  if (!needsDoseEstimate(input)) return { recipeId, status: 'nothing_to_do' };
  if (!deps.doseEstimator) return { recipeId, status: 'skipped', reason: 'not_configured' };

  const { data: allowed, error: quotaError } = await supabase.rpc('consume_extraction_quota', {
    daily_limit: deps.dailyLimit,
  });
  if (quotaError) throw quotaError;
  if (!allowed) return { recipeId, status: 'skipped', reason: 'quota_exceeded' };

  const outcome = await deps.doseEstimator(input);
  if (!outcome.ok) return { recipeId, status: 'error', reason: outcome.reason };

  const merged = applyDoseEstimate(input, outcome.estimate);
  const { error: saveError } = await supabase.rpc('update_recipe', {
    p_recipe_id: recipeId,
    p_recipe: {
      title: recipe.title,
      description: recipe.description,
      servings: merged.servings,
      servings_estimated: recipe.servings_estimated || merged.servingsEstimated,
      prep_minutes: recipe.prep_minutes,
      cook_minutes: recipe.cook_minutes,
      total_minutes: recipe.total_minutes,
      tags: recipe.tags,
      ingredients: merged.ingredients.map((i, index) => ({ ...i, aisle: ingredients[index].aisle })),
      steps: steps.map((s) => ({ text: s.text, timer_seconds: s.timer_seconds })),
    },
  });
  if (saveError) {
    console.error('update_recipe failed', saveError);
    return { recipeId, status: 'error', reason: 'save_failed' };
  }
  return { recipeId, status: 'done', changed: merged.changed, servings: merged.servings };
}

async function setStatus(supabase: SupabaseClient, id: string, status: string, errorMessage: string | null) {
  const { error } = await supabase.from('sources').update({ status, error_message: errorMessage }).eq('id', id);
  if (error) console.error('status update failed', error);
}

async function reload(supabase: SupabaseClient, id: string) {
  const { data } = await supabase.from('sources').select('*').eq('id', id).maybeSingle();
  return data;
}

// come il limite della cartella 'images' (5 MB)
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Foto in base64 dal sito: tipo ammesso e dimensione massima, altrimenti null. */
function parsePhoto(imageBase64: unknown, mimeType: unknown): { mimeType: string; data: string } | null {
  if (typeof imageBase64 !== 'string') return null;
  const type = typeof mimeType === 'string' ? mimeType.toLowerCase() : '';
  if (!IMAGE_TYPES[type]) return null;
  const data = imageBase64.replace(/^data:[^,]+,/, '');
  // 4 caratteri base64 = 3 byte
  if (!data || (data.length * 3) / 4 > MAX_PHOTO_BYTES || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
  return { mimeType: type, data };
}

/** Salva la foto di una ricetta nello storage, crea il "link" e la fa leggere all'AI. */
async function savePhoto(
  imageBase64: string,
  mimeType: unknown,
  text: string,
  userId: string,
  supabase: SupabaseClient,
  deps: Deps,
): Promise<Response> {
  const type = typeof mimeType === 'string' ? mimeType.toLowerCase() : '';
  const ext = IMAGE_TYPES[type];
  if (!ext) return errorResponse('invalid_image', 400);
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(imageBase64.replace(/^data:[^,]+,/, '')), (c) => c.charCodeAt(0));
  } catch {
    return errorResponse('invalid_image', 400);
  }
  if (!bytes.byteLength || bytes.byteLength > MAX_PHOTO_BYTES) return errorResponse('invalid_image', 400);

  // prima il limite giornaliero, poi il salvataggio: niente foto caricate se l'AI non può leggerle
  if (!deps.extractor) return errorResponse('ai_not_configured', 503);
  const { data: allowed, error: quotaError } = await supabase.rpc('consume_extraction_quota', {
    daily_limit: deps.dailyLimit,
  });
  if (quotaError) throw quotaError;
  if (!allowed) return errorResponse('quota_exceeded', 429);

  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from('images').upload(path, bytes, { contentType: type });
  if (uploadError) throw uploadError;
  const publicUrl = supabase.storage.from('images').getPublicUrl(path).data.publicUrl;

  const { data: inserted, error: insertError } = await supabase
    .from('sources')
    .insert({
      url: publicUrl,
      platform: 'manual',
      title: null,
      thumbnail_url: publicUrl,
      shared_text: text || null,
      status: 'pending',
    })
    .select('*')
    .single();
  if (insertError) throw insertError;

  const source = inserted as Source;
  const analysis = await analyze(
    source,
    null,
    supabase,
    deps,
    { mimeType: type, data: imageBase64.replace(/^data:[^,]+,/, '') },
    true,
  );
  return json({ source: await reload(supabase, source.id), duplicate: false, needsText: false, analysis }, 201);
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
  const bytes = await readBytesLimited(res, MAX_IMAGE_BYTES);
  if (!bytes || !bytes.byteLength) return url;

  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('images').upload(path, bytes, { contentType: type, upsert: false });
  if (error) return url;
  return supabase.storage.from('images').getPublicUrl(path).data.publicUrl;
}
