// Tipi comuni per il servizio AI che estrae ricette e locali (oggi Gemini, in futuro intercambiabile).
import type { DoseEstimate, DoseInput } from './doses.ts';
import type { ExtractionInput, RawExtraction } from './extraction.ts';

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
