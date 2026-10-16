// Azioni sulle cose già salvate (chiamate dalla funzione "extract"):
//   recipe_insights  → calorie e valori per porzione, difficoltà, costo
//   recipe_variant   → variante (vegana, senza glutine, light…) da mostrare e, se piace, salvare
//   refresh_place    → aggiorna indirizzo, coordinate, telefono, sito e orari di un locale

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

import type { RecipeTools } from '../_shared/ai.ts';
import type { Geocoder } from '../_shared/geocode.ts';
import { type CleanInsights, cleanInsights } from '../_shared/insights.ts';
import { type CleanVariant, cleanVariant, type RecipeForAi, type VariantKind } from '../_shared/recipeTools.ts';

type Ctx = { supabase: SupabaseClient; recipeTools: RecipeTools | null; geocoder: Geocoder; dailyLimit: number };

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
export async function refreshPlace(placeId: string, ctx: Ctx): Promise<{ status: 'done' | 'not_found' } | Failed> {
  const { data, error } = await ctx.supabase.from('places').select('*').eq('id', placeId).maybeSingle();
  if (error) throw error;
  if (!data) return { status: 'error', reason: 'not_found' };
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
