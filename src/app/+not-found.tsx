import { Redirect } from 'expo-router';

/** Pagina che non esiste più (es. un vecchio link al Planner): si torna all'inizio. */
export default function NotFound() {
  return <Redirect href="/" />;
}
