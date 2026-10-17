import { Redirect } from 'expo-router';

/** "Cosa cucino con ciò che ho" ora è la scheda Frigo. */
export default function PantryRedirect() {
  return <Redirect href="/fridge" />;
}
