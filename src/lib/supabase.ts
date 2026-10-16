import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { config } from './env';

// Se la configurazione manca, l'app mostra una schermata di aiuto (vedi app/_layout.tsx)
// e questo client non viene mai usato: i valori segnaposto evitano solo un crash all'avvio.
export const supabase = createClient(
  config?.supabaseUrl ?? 'http://localhost:54321',
  config?.supabaseKey ?? 'missing-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  },
);

// Sul telefono il rinnovo automatico della sessione va acceso/spento
// quando l'app passa in primo piano o in background.
if (Platform.OS !== 'web' && config) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
