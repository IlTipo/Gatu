// Legge la configurazione pubblica dell'app (variabili EXPO_PUBLIC_* nel file .env).
// Queste chiavi possono stare nell'app: sono "pubbliche" e protette dalle regole RLS.
// Le chiavi segrete (Gemini, Google Places) NON vanno mai qui: stanno nelle Edge Functions.

export type AppConfig = {
  supabaseUrl: string;
  supabaseKey: string;
};

export function readConfig(env: Record<string, string | undefined>): AppConfig | null {
  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const supabaseKey = env.EXPO_PUBLIC_SUPABASE_KEY?.trim();
  if (!supabaseUrl || !supabaseKey) return null;
  if (!/^https?:\/\//.test(supabaseUrl)) return null;
  return { supabaseUrl: supabaseUrl.replace(/\/+$/, ''), supabaseKey };
}

// Expo sostituisce process.env.EXPO_PUBLIC_* al momento della compilazione:
// vanno letti uno per uno, non con process.env[nome].
export const config = readConfig({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_KEY: process.env.EXPO_PUBLIC_SUPABASE_KEY,
});
