// Azioni sulle cose già salvate (chiamate dalla funzione "extract"):
//   recipe_insights  → calorie e valori per porzione, difficoltà, costo
//   recipe_variant   → variante (vegana, senza glutine, light…) da mostrare e, se piace, salvare
//   refresh_place    → aggiorna indirizzo, coordinate, telefono, sito e orari di un locale
//   recipe_video     → procedimento (e dosi) dal video caricato dall'utente
//   fridge_scan      → foto del frigo → alimenti che si vedono
//   fridge_recipe    → alimenti che hai → ricetta nuova (proposta, non salvata)
//   estimate_food    → "cosa ho mangiato" (testo o foto) → calorie e macro per il diario
//   ask_library      → "Chiedi all'AI": sceglie tra ricette e locali salvati in base a una domanda

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

import type { Extractor, RecipeTools } from '../_shared/ai.ts';
import {
  buildCatalog,
  type CatalogPlace,
  type CatalogRecipe,
  type CleanAnswer,
  cleanAnswer,
  MAX_CATALOG_ITEMS,
} from '../_shared/ask.ts';
import type { Geocoder } from '../_shared/geocode.ts';
import { type CleanInsights, cleanInsights } from '../_shared/insights.ts';
import { cleanExtraction, type CleanIngredient, type ExtractionInput } from '../_shared/extraction.ts';
import { type CleanVariant, cleanVariant, type RecipeForAi, type VariantKind } from '../_shared/recipeTools.ts';
import { type CleanFood, cleanFood } from '../_shared/food.ts';
import { type CleanDietPlan, cleanDietPlan } from '../_shared/dietPlan.ts';
import { type CleanShoppingItem, cleanShoppingScan } from '../_shared/shoppingPhoto.ts';
import { type CleanFridgeRecipe, cleanFridgeRecipe, cleanFridgeScan, type FridgeRequest } from '../_shared/fridge.ts';
import { MAX_VIDEO_BYTES, mergeVideoRecipe, parseVideoPath, type SavedRecipe } from '../_shared/video.ts';

type Ctx = {
  supabase: SupabaseClient;
  recipeTools: RecipeTools | null;
  extractor: Extractor | null;
  geocoder: Geocoder;
  dailyLimit: number;
  userId: string;
};

type Skipped = { status: 'skipped'; reason: 'not_configured' | 'quota_exceeded' };
type Failed = { status: 'error'; reason: string };

/** Ricetta con ingredienti e passaggi in ordine, nel formato usato dall'AI. */
export async function loadRecipe(supabase: SupabaseClient, recipeId: string) {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_ingredients(*), recipe_steps(*)')
    .eq('id', recipeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, unknown> & {
    title: string;
    servings: number | null;
    tags: string[];
    image_url: string | null;
    description: string | null;
    prep_minutes: number | null;
    cook_minutes: number | null;
    recipe_ingredients: {
      position: number;
      quantity: number | null;
      unit: string | null;
      name: string;
      note: string | null;
      aisle: string;
    }[];
    recipe_steps: { position: number; text: string; timer_seconds: number | null }[];
  };
  const recipe: RecipeForAi = {
    title: row.title,
    servings: row.servings,
    tags: row.tags,
    prep_minutes: row.prep_minutes,
    cook_minutes: row.cook_minutes,
    ingredients: [...row.recipe_ingredients]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        quantity: i.quantity === null ? null : Number(i.quantity),
        unit: i.unit,
        name: i.name,
        note: i.note,
        aisle: i.aisle,
      })),
    steps: [...row.recipe_steps].sort((a, b) => a.position - b.position).map((s) => ({
      text: s.text,
      timer_seconds: s.timer_seconds,
    })),
  };
  return { row, recipe };
}

async function consumeQuota(ctx: Ctx): Promise<boolean> {
  const { data, error } = await ctx.supabase.rpc('consume_extraction_quota', { daily_limit: ctx.dailyLimit });
  if (error) throw error;
  return !!data;
}

/** Calcola e salva calorie, valori, difficoltà e costo di una ricetta. */
export async function recipeInsights(
  recipeId: string,
  ctx: Ctx,
): Promise<{ status: 'done'; insights: CleanInsights } | Skipped | Failed> {
  if (!ctx.recipeTools) return { status: 'skipped', reason: 'not_configured' };
  const loaded = await loadRecipe(ctx.supabase, recipeId);
  if (!loaded) return { status: 'error', reason: 'not_found' };
  if (!(await consumeQuota(ctx))) return { status: 'skipped', reason: 'quota_exceeded' };

  const outcome = await ctx.recipeTools.insights(loaded.recipe);
  if (!outcome.ok) return { status: 'error', reason: outcome.reason };
  const insights = cleanInsights(outcome.insights);
  if (!insights) return { status: 'error', reason: 'invalid_output' };

  const { error } = await ctx.supabase
    .from('recipes')
    .update({ ...insights, insights_at: new Date().toISOString() })
    .eq('id', recipeId);
  if (error) {
    console.error('insights update failed', error);
    return { status: 'error', reason: 'save_failed' };
  }
  return { status: 'done', insights };
}

/** Propone una variante della ricetta (non la salva: lo decide l'utente). */
export async function recipeVariant(
  recipeId: string,
  kind: VariantKind,
  ctx: Ctx,
): Promise<
  | { status: 'done'; variant: CleanVariant & { image_url: string | null; description: string | null } }
  | Skipped
  | Failed
> {
  if (!ctx.recipeTools) return { status: 'skipped', reason: 'not_configured' };
  const loaded = await loadRecipe(ctx.supabase, recipeId);
  if (!loaded) return { status: 'error', reason: 'not_found' };
  if (!(await consumeQuota(ctx))) return { status: 'skipped', reason: 'quota_exceeded' };

  const outcome = await ctx.recipeTools.variant(loaded.recipe, kind);
  if (!outcome.ok) return { status: 'error', reason: outcome.reason };
  const variant = cleanVariant(outcome.variant, kind, loaded.recipe);
  if (!variant) return { status: 'error', reason: 'invalid_output' };
  return {
    status: 'done',
    variant: { ...variant, image_url: loaded.row.image_url, description: loaded.row.description },
  };
}

/** Cerca di nuovo il locale (indirizzo, posizione, telefono, sito, orari) e aggiorna i dati trovati. */
export async function refreshPlace(
  placeId: string,
  ctx: Ctx,
): Promise<{ status: 'done' | 'not_found' } | Skipped | Failed> {
  const { data, error } = await ctx.supabase.from('places').select('*').eq('id', placeId).maybeSingle();
  if (error) throw error;
  if (!data) return { status: 'error', reason: 'not_found' };
  // anche la ricerca dell'indirizzo conta nel limite giornaliero (Google Places può costare)
  if (!(await consumeQuota(ctx))) return { status: 'skipped', reason: 'quota_exceeded' };
  const place = data as {
    name: string;
    city: string | null;
    address: string | null;
    phone: string | null;
    website: string | null;
    opening_hours: string | null;
  };

  const geo = await ctx.geocoder({ name: place.name, city: place.city, address: place.address });
  if (!geo) return { status: 'not_found' };
  const { error: updateError } = await ctx.supabase
    .from('places')
    .update({
      address: place.address ?? geo.address,
      city: place.city ?? geo.city,
      latitude: geo.latitude,
      longitude: geo.longitude,
      google_place_id: geo.googlePlaceId,
      verified: true,
      phone: geo.phone ?? place.phone,
      website: geo.website ?? place.website,
      opening_hours: geo.openingHours ?? place.opening_hours,
    })
    .eq('id', placeId);
  if (updateError) {
    console.error('place update failed', updateError);
    return { status: 'error', reason: 'save_failed' };
  }
  return { status: 'done' };
}

/** Risponde a una domanda scegliendo tra le ricette e i locali salvati dall'utente. */
export async function askLibrary(
  question: string,
  ctx: Ctx,
): Promise<({ status: 'done' } & CleanAnswer) | { status: 'empty' } | Skipped | Failed> {
  if (!ctx.recipeTools) return { status: 'skipped', reason: 'not_configured' };
  const [recipes, places] = await Promise.all([
    ctx.supabase
      .from('recipes')
      .select('id, title, tags, total_minutes, kcal_per_serving, difficulty, recipe_ingredients(name)')
      .order('created_at', { ascending: false })
      .limit(MAX_CATALOG_ITEMS),
    ctx.supabase
      .from('places')
      .select('id, name, city, cuisine, price_level, recommended_dishes, wishlist')
      .order('created_at', { ascending: false })
      .limit(MAX_CATALOG_ITEMS),
  ]);
  if (recipes.error) throw recipes.error;
  if (places.error) throw places.error;
  const catalog = buildCatalog((recipes.data ?? []) as CatalogRecipe[], (places.data ?? []) as CatalogPlace[]);
  if (!catalog.refs.size) return { status: 'empty' };
  if (!(await consumeQuota(ctx))) return { status: 'skipped', reason: 'quota_exceeded' };

  const outcome = await ctx.recipeTools.ask(question, catalog.text);
  if (!outcome.ok) return { status: 'error', reason: outcome.reason };
  return { status: 'done', ...cleanAnswer(outcome.answer, catalog.refs) };
}

/**
 * Legge procedimento e dosi dal video caricato dall'utente e aggiorna la STESSA ricetta
 * (voti, note, planner e collezioni restano). Il video viene cancellato in ogni caso.
 */
export async function recipeFromVideo(
  recipeId: string,
  videoPath: string,
  ctx: Ctx,
): Promise<{ status: 'done'; changed: string[] } | Skipped | Failed> {
  const video = parseVideoPath(videoPath, ctx.userId);
  if (!video) return { status: 'error', reason: 'invalid_video' };
  try {
    if (!ctx.extractor) return { status: 'skipped', reason: 'not_configured' };
    const loaded = await loadRecipe(ctx.supabase, recipeId);
    if (!loaded) return { status: 'error', reason: 'not_found' };
    if (!(await consumeQuota(ctx))) return { status: 'skipped', reason: 'quota_exceeded' };

    const { data: blob, error: downloadError } = await ctx.supabase.storage.from('videos').download(videoPath);
    if (downloadError || !blob) return { status: 'error', reason: 'video_not_found' };
    if (!blob.size || blob.size > MAX_VIDEO_BYTES) return { status: 'error', reason: 'invalid_video' };
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const row = loaded.row as typeof loaded.row & {
      source_id: string | null;
      servings_estimated: boolean;
      total_minutes: number | null;
      recipe_ingredients: { estimated?: boolean }[];
    };
    const { data: source } = row.source_id
      ? await ctx.supabase
        .from('sources')
        .select('url, platform, title, description, author_name, shared_text')
        .eq('id', row.source_id)
        .maybeSingle()
      : { data: null };
    const src = source as Record<string, string | null> | null;
    const input: ExtractionInput = {
      url: src?.url ?? 'video caricato',
      platform: src?.platform ?? 'manual',
      title: src?.title ?? row.title,
      description: src?.description ?? row.description,
      author: src?.author_name ?? null,
      sharedText: src?.shared_text ?? null,
      recipeJsonLd: null,
      video: { mimeType: video.mimeType, bytes },
    };
    const outcome = await ctx.extractor(input);
    if (!outcome.ok) return { status: 'error', reason: outcome.reason };
    const clean = cleanExtraction(outcome.extraction);
    if (clean.kind !== 'recipe' || !clean.recipe) return { status: 'error', reason: 'no_recipe' };

    const ingredientsSorted = [...row.recipe_ingredients] as unknown as (CleanIngredient & { position: number })[];
    ingredientsSorted.sort((a, b) => a.position - b.position);
    const saved: SavedRecipe = {
      title: row.title,
      description: row.description,
      servings: row.servings,
      servings_estimated: row.servings_estimated,
      prep_minutes: row.prep_minutes,
      cook_minutes: row.cook_minutes,
      total_minutes: row.total_minutes,
      tags: row.tags,
      ingredients: ingredientsSorted.map((i) => ({
        quantity: i.quantity === null ? null : Number(i.quantity),
        unit: i.unit,
        name: i.name,
        note: i.note,
        aisle: i.aisle,
        estimated: !!i.estimated,
      })),
      steps: loaded.recipe.steps,
    };
    const { recipe, changed } = mergeVideoRecipe(saved, clean.recipe);
    const { error } = await ctx.supabase.rpc('update_recipe', { p_recipe_id: recipeId, p_recipe: recipe });
    if (error) {
      console.error('update_recipe (video) failed', error);
      return { status: 'error', reason: 'save_failed' };
    }
    return { status: 'done', changed };
  } finally {
    // il video serviva solo per la lettura: non resta salvato
    await ctx.supabase.storage.from('videos').remove([videoPath]).catch(() => {});
  }
}

/** Foto del frigo → elenco degli alimenti che si vedono. */
export async function fridgeScan(
  image: { mimeType: string; data: string },
  ctx: Ctx,
): Promise<{ status: 'done'; ingredients: string[] } | Skipped | Failed> {
  if (!ctx.recipeTools) return { status: 'skipped', reason: 'not_configured' };
  if (!(await consumeQuota(ctx))) return { status: 'skipped', reason: 'quota_exceeded' };
  const outcome = await ctx.recipeTools.fridgeScan(image);
  if (!outcome.ok) return { status: 'error', reason: outcome.reason };
  return { status: 'done', ingredients: cleanFridgeScan(outcome.scan) };
}

/** Foto di una lista della spesa → voci da comprare (da confermare prima di aggiungerle). */
export async function shoppingScan(
  image: { mimeType: string; data: string },
  ctx: Ctx,
): Promise<{ status: 'done'; items: CleanShoppingItem[] } | Skipped | Failed> {
  if (!ctx.recipeTools) return { status: 'skipped', reason: 'not_configured' };
  if (!(await consumeQuota(ctx))) return { status: 'skipped', reason: 'quota_exceeded' };
  const outcome = await ctx.recipeTools.shoppingScan(image);
  if (!outcome.ok) return { status: 'error', reason: outcome.reason };
  return { status: 'done', items: cleanShoppingScan(outcome.scan) };
}

/** Piano alimentare da foto, PDF o testo → giorni, pasti e alternative (si salva solo dopo averlo visto). */
export async function readDietPlan(
  files: { mimeType: string; data: string }[],
  text: string,
  ctx: Ctx,
): Promise<{ status: 'done'; plan: CleanDietPlan } | { status: 'not_plan' } | Skipped | Failed> {
  if (!ctx.recipeTools) return { status: 'skipped', reason: 'not_configured' };
  if (!(await consumeQuota(ctx))) return { status: 'skipped', reason: 'quota_exceeded' };
  const outcome = await ctx.recipeTools.dietPlan(files, text);
  if (!outcome.ok) return { status: 'error', reason: outcome.reason };
  const plan = cleanDietPlan(outcome.plan);
  return plan.days.length ? { status: 'done', plan } : { status: 'not_plan' };
}

/** Alimenti che hai → una ricetta nuova (da mostrare; si salva solo se piace). */
export async function fridgeRecipe(
  request: FridgeRequest,
  ctx: Ctx,
): Promise<{ status: 'done'; recipe: CleanFridgeRecipe } | Skipped | Failed> {
  if (!ctx.recipeTools) return { status: 'skipped', reason: 'not_configured' };
  if (!(await consumeQuota(ctx))) return { status: 'skipped', reason: 'quota_exceeded' };
  const outcome = await ctx.recipeTools.fridgeRecipe(request);
  if (!outcome.ok) return { status: 'error', reason: outcome.reason };
  const recipe = cleanFridgeRecipe(outcome.recipe, request);
  if (!recipe) return { status: 'error', reason: 'invalid_output' };
  return { status: 'done', recipe };
}

/** Diario calorie: "cosa ho mangiato" (testo e/o foto del piatto) → calorie e macro stimate. */
export async function estimateFood(
  text: string,
  image: { mimeType: string; data: string } | null,
  ctx: Ctx,
): Promise<{ status: 'done'; food: CleanFood } | { status: 'not_food' } | Skipped | Failed> {
  if (!ctx.recipeTools) return { status: 'skipped', reason: 'not_configured' };
  if (!(await consumeQuota(ctx))) return { status: 'skipped', reason: 'quota_exceeded' };
  const outcome = await ctx.recipeTools.food(text, image);
  if (!outcome.ok) return { status: 'error', reason: outcome.reason };
  const food = cleanFood(outcome.food, text);
  return food ? { status: 'done', food } : { status: 'not_food' };
}
