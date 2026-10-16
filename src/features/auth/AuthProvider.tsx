import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  /** true finché non sappiamo ancora se l'utente è collegato (lettura dal telefono). */
  initializing: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, initializing: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, initializing: true });

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) setState({ session: data.session, initializing: false });
      })
      .catch(() => {
        if (mounted) setState({ session: null, initializing: false });
      });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // All'uscita svuotiamo la cache, così i dati di un utente non restano visibili a un altro.
      if (event === 'SIGNED_OUT') queryClient.clear();
      setState({ session, initializing: false });
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
