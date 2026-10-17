import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

import { createGeminiDoseEstimator, createGeminiExtractor, createGeminiRecipeTools } from '../_shared/gemini.ts';
import { createGeocoder } from '../_shared/geocode.ts';
import { createResendMailer } from '../_shared/mail.ts';
import { errorResponse } from '../_shared/http.ts';
import { handleRequest } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL'); // facoltativo: di base "gemini-flash-latest"
// facoltativo: modelli di riserva quando finisce la quota gratuita (separati da virgola)
const GEMINI_FALLBACK_MODELS = Deno.env.get('GEMINI_FALLBACK_MODELS')?.split(',').map((m) => m.trim()).filter(Boolean);
const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');
// Massimo di analisi AI al giorno per utente (resta dentro i limiti del piano gratuito).
// Un valore strano o assente torna a 40 (mai illimitato).
const parsedLimit = Number.parseInt(Deno.env.get('DAILY_EXTRACTION_LIMIT') ?? '', 10);
const DAILY_LIMIT = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 500) : 40;

const extractor = GEMINI_API_KEY
  ? createGeminiExtractor(GEMINI_API_KEY, { model: GEMINI_MODEL ?? undefined, fallbackModels: GEMINI_FALLBACK_MODELS })
  : null;
const doseEstimator = GEMINI_API_KEY
  ? createGeminiDoseEstimator(GEMINI_API_KEY, {
    model: GEMINI_MODEL ?? undefined,
    fallbackModels: GEMINI_FALLBACK_MODELS,
  })
  : null;
const recipeTools = GEMINI_API_KEY
  ? createGeminiRecipeTools(GEMINI_API_KEY, {
    model: GEMINI_MODEL ?? undefined,
    fallbackModels: GEMINI_FALLBACK_MODELS,
  })
  : null;
const geocoder = createGeocoder({ googleApiKey: GOOGLE_PLACES_API_KEY, fetch });
// "Cosa aggiungeresti?": i consigli arrivano a FEEDBACK_EMAIL tramite Resend (facoltativo)
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FEEDBACK_EMAIL = Deno.env.get('FEEDBACK_EMAIL')?.trim();
const mailer = RESEND_API_KEY && FEEDBACK_EMAIL ? createResendMailer(RESEND_API_KEY, FEEDBACK_EMAIL, fetch) : null;

// "Elimina account": serve la chiave di servizio (Supabase la mette da sola nelle funzioni, mai nel sito)
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const admin = SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

async function deleteAccount(userId: string) {
  if (!admin) throw new Error('service key missing');
  // prima le foto e i video della sua cartella, poi l'account (i dati nel database se ne vanno con lui)
  for (const bucket of ['images', 'videos']) {
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
      if (error) throw error;
      const files = (data ?? []).filter((f) => f.id).map((f) => `${userId}/${f.name}`);
      if (!files.length) break;
      const { error: removeError } = await admin.storage.from(bucket).remove(files);
      if (removeError) throw removeError;
    }
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req, {
      fetch,
      extractor,
      doseEstimator,
      recipeTools,
      geocoder,
      mailer,
      deleteAccount: admin ? deleteAccount : null,
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
