import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

import { errorResponse } from '../_shared/http.ts';
import { handleRequest } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

Deno.serve(async (req) => {
  try {
    return await handleRequest(req, {
      fetch,
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
