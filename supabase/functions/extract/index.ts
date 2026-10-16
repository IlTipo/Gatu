import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

import { createGeminiExtractor } from '../_shared/gemini.ts';
import { createGeocoder } from '../_shared/geocode.ts';
import { errorResponse } from '../_shared/http.ts';
import { handleRequest } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL'); // facoltativo: di base "gemini-flash-latest"
const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');
// Massimo di analisi AI al giorno per utente (resta dentro i limiti del piano gratuito).
const DAILY_LIMIT = Number(Deno.env.get('DAILY_EXTRACTION_LIMIT') ?? 40);

const extractor = GEMINI_API_KEY ? createGeminiExtractor(GEMINI_API_KEY, { model: GEMINI_MODEL ?? undefined }) : null;
const geocoder = createGeocoder({ googleApiKey: GOOGLE_PLACES_API_KEY, fetch });

Deno.serve(async (req) => {
  try {
    return await handleRequest(req, {
      fetch,
      extractor,
      geocoder,
      dailyLimit: DAILY_LIMIT,
      geocodeDelayMs: GOOGLE_PLACES_API_KEY ? 0 : 1100,
      supabaseForRequest(request) {
        const authorization = request.headers.get('authorization');
        // La chiave pubblica arriva dall'app (intestazione "apikey"); in alternativa quella del progetto.
        const apiKey = request.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY');
        if (!authorization || !apiKey) return null;
        return createClient(SUPABASE_URL, apiKey, {
          global: { headers: { Authorization: authorization } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
      },
    });
  } catch (e) {
    console.error('extract failed', e);
    return errorResponse('internal_error', 500);
  }
});
