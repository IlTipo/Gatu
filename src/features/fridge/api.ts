import { useMutation } from '@tanstack/react-query';

import { invokeExtract } from '@/features/sources/api';

type Skipped = { status: 'skipped'; reason: 'not_configured' | 'quota_exceeded' };
type Failed = { status: 'error'; reason: string };

export type FridgeRecipe = {
  title: string;
  description: string | null;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  tags: string[];
  uses: string[];
  missing: string[];
  ingredients: { quantity: number | null; unit: string | null; name: string; note: string | null; aisle: string; estimated: boolean }[];
  steps: { text: string; timer_seconds: number | null }[];
};

export type ScanResult = { status: 'done'; ingredients: string[] } | Skipped | Failed;
export type FridgeRecipeResult = { status: 'done'; recipe: FridgeRecipe } | Skipped | Failed;

/** Foto del frigo → alimenti riconosciuti dall'AI. */
export function useFridgeScan() {
  return useMutation({
    mutationFn: (photo: { base64: string; mimeType: string }) =>
      invokeExtract<ScanResult>({ action: 'fridge_scan', imageBase64: photo.base64, mimeType: photo.mimeType }),
  });
}

/** Alimenti → ricetta nuova inventata dall'AI (non salvata finché non lo chiedi). */
export function useFridgeRecipe() {
  return useMutation({
    mutationFn: (request: { ingredients: string[]; servings: number | null; maxMinutes: number | null; avoid: string[] }) =>
      invokeExtract<FridgeRecipeResult>({ action: 'fridge_recipe', ...request }),
  });
}

// Gli ingredienti scritti restano finché il sito è aperto (cambiando scheda li ritrovi).
let remembered: string[] = [];
export const rememberedPantry = () => remembered;
export const rememberPantry = (items: string[]) => {
  remembered = items;
};
