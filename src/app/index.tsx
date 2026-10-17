import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/AuthProvider';
import { needsInstallHint } from '@/features/install/device';

// Pagina iniziale: smista verso la Libreria, l'invito ad aggiungere Morso alla Home o l'accesso.
export default function Index() {
  const { session } = useAuth();
  if (session) return <Redirect href="/library" />;
  return <Redirect href={needsInstallHint() ? '/welcome' : '/sign-in'} />;
}
