// Tipi comuni per il servizio AI che estrae ricette e locali (oggi Gemini, in futuro intercambiabile).
import type { ExtractionInput, RawExtraction } from './extraction.ts';

export type ModelOutcome =
  | { ok: true; extraction: RawExtraction; model: string; usage: { input: number; output: number } }
  | {
    ok: false;
    reason: 'refusal' | 'truncated' | 'invalid_output' | 'rate_limited' | 'overloaded' | 'api_error' | 'auth';
  };

export type Extractor = (input: ExtractionInput) => Promise<ModelOutcome>;
