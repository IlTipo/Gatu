import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/AuthProvider';

// Pagina iniziale: smista verso la Libreria o verso l'accesso.
export default function Index() {
  const { session } = useAuth();
  return <Redirect href={session ? '/library' : '/sign-in'} />;
}
