// Risposte JSON con le intestazioni CORS (il sito su github.io chiama le funzioni su supabase.co).

export const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
  });
}

/** Errore con un codice stabile che l'app traduce in un messaggio in italiano. */
export function errorResponse(code: string, status: number): Response {
  return json({ error: code }, status);
}
