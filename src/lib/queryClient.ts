import { QueryClient } from '@tanstack/react-query';

// TanStack Query tiene in memoria i dati scaricati e gestisce caricamento, errori e nuovi tentativi.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      // i dati restano in memoria un giorno: servono anche offline
      gcTime: 24 * 60 * 60_000,
    },
  },
});
