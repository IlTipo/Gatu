// Chiamata all'API di Claude (modello Sonnet) per l'estrazione.
// La chiave ANTHROPIC_API_KEY esiste solo come segreto della Edge Function: mai nell'app.

import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { betaZodOutputFormat } from 'npm:@anthropic-ai/sdk@0.135.0/helpers/beta/zod';

import {
  buildUserMessage,
  ExtractionInput,
  ExtractionSchema,
  type RawExtraction,
  SYSTEM_PROMPT,
} from './extraction.ts';

export const MODEL = 'claude-sonnet-5-5';

export type ModelOutcome =
  | { ok: true; extraction: RawExtraction; model: string; usage: { input: number; output: number } }
  | {
    ok: false;
    reason: 'refusal' | 'truncated' | 'invalid_output' | 'rate_limited' | 'overloaded' | 'api_error' | 'auth';
  };

export type Extractor = (input: ExtractionInput) => Promise<ModelOutcome>;

/** `fetchImpl` serve solo ai test, per simulare le risposte dell'API senza spendere. */
export function createClaudeExtractor(apiKey: string, fetchImpl?: typeof fetch): Extractor {
  const client = new Anthropic({
    apiKey,
    maxRetries: fetchImpl ? 0 : 2,
    timeout: 90_000,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });

  return async (input) => {
    try {
      // create (non parse): così controlliamo stop_reason prima di leggere il JSON,
      // anche quando la risposta è stata tagliata o rifiutata.
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserMessage(input) }],
        // Estrarre dati da un testo è un compito semplice: poco "ragionamento", risposte più rapide ed economiche.
        output_config: { effort: 'low', format: betaZodOutputFormat(ExtractionSchema) },
        // Se il modello rifiuta per motivi di sicurezza, l'API riprova da sola su un modello di riserva.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });

      if (response.stop_reason === 'refusal') return { ok: false, reason: 'refusal' };
      if (response.stop_reason === 'max_tokens') return { ok: false, reason: 'truncated' };

      const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        return { ok: false, reason: 'invalid_output' };
      }
      const parsed = ExtractionSchema.safeParse(data);
      if (!parsed.success) {
        console.error('Claude output does not match schema', parsed.error.issues.slice(0, 5));
        return { ok: false, reason: 'invalid_output' };
      }
      return {
        ok: true,
        extraction: parsed.data,
        model: response.model,
        usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      };
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        return { ok: false, reason: 'auth' };
      }
      if (e instanceof Anthropic.RateLimitError) return { ok: false, reason: 'rate_limited' };
      if (e instanceof Anthropic.InternalServerError) return { ok: false, reason: 'overloaded' };
      if (e instanceof Anthropic.APIError) {
        console.error('Claude API error', e.status, e.message);
        return { ok: false, reason: 'api_error' };
      }
      console.error('Claude extraction failed', e);
      return { ok: false, reason: 'api_error' };
    }
  };
}
