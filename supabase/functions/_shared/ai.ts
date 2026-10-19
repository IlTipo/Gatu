// Tipi comuni per il servizio AI che estrae ricette e locali (oggi Gemini, in futuro intercambiabile).
import type { RawAnswer } from './ask.ts';
import type { DoseEstimate, DoseInput } from './doses.ts';
import type { RawFood } from './food.ts';
import type { FridgeRequest, RawFridgeRecipe, RawFridgeScan } from './fridge.ts';
import type { RawShoppingScan } from './shoppingPhoto.ts';
import type { ExtractionInput, RawExtraction } from './extraction.ts';
import type { RawInsights } from './insights.ts';
import type { RawVariant, RecipeForAi, VariantKind } from './recipeTools.ts';

export type ModelOutcome =
  | { ok: true; extraction: RawExtraction; model: string; usage: { input: number; output: number } }
  | {
    ok: false;
    reason: 'refusal' | 'truncated' | 'invalid_output' | 'rate_limited' | 'overloaded' | 'api_error' | 'auth';
  };

export type Extractor = (input: ExtractionInput) => Promise<ModelOutcome>;

export type Failure = Extract<ModelOutcome, { ok: false }>;

export type DoseOutcome =
  | { ok: true; estimate: DoseEstimate; model: string; usage: { input: number; output: number } }
  | Failure;

export type DoseEstimator = (input: DoseInput) => Promise<DoseOutcome>;

type Usage = { model: string; usage: { input: number; output: number } };
export type InsightsOutcome = ({ ok: true; insights: RawInsights } & Usage) | Failure;
export type VariantOutcome = ({ ok: true; variant: RawVariant } & Usage) | Failure;
export type AskOutcome = ({ ok: true; answer: RawAnswer } & Usage) | Failure;
export type FridgeScanOutcome = ({ ok: true; scan: RawFridgeScan } & Usage) | Failure;
export type FridgeRecipeOutcome = ({ ok: true; recipe: RawFridgeRecipe } & Usage) | Failure;
export type ShoppingScanOutcome = ({ ok: true; scan: RawShoppingScan } & Usage) | Failure;
export type FoodOutcome = ({ ok: true; food: RawFood } & Usage) | Failure;

/** Strumenti AI sulle cose salvate: valori/difficoltà/costo, varianti, domande sulla libreria. */
export type RecipeTools = {
  insights: (recipe: RecipeForAi) => Promise<InsightsOutcome>;
  variant: (recipe: RecipeForAi, kind: VariantKind) => Promise<VariantOutcome>;
  ask: (question: string, catalog: string) => Promise<AskOutcome>;
  /** foto del frigo → alimenti che si vedono */
  fridgeScan: (image: { mimeType: string; data: string }) => Promise<FridgeScanOutcome>;
  /** foto di una lista della spesa → voci da comprare */
  shoppingScan: (image: { mimeType: string; data: string }) => Promise<ShoppingScanOutcome>;
  /** alimenti che hai → ricetta nuova */
  fridgeRecipe: (request: FridgeRequest) => Promise<FridgeRecipeOutcome>;
  /** "cosa ho mangiato" (testo e/o foto del piatto) → calorie e macro */
  food: (text: string, image: { mimeType: string; data: string } | null) => Promise<FoodOutcome>;
};
