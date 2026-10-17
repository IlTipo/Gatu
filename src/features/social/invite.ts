// Link d'invito aperto prima dell'accesso: il codice si tiene da parte e si usa subito dopo.

const KEY = 'morso.pendingInvite';

export function savePendingInvite(code: string) {
  const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12);
  if (!clean) return;
  try {
    globalThis.localStorage?.setItem(KEY, clean);
  } catch {
    // memoria non disponibile: l'amico potrà comunque scrivere il codice a mano
  }
}

/** Il codice in attesa (e lo toglie, così si usa una volta sola). */
export function takePendingInvite(): string | null {
  try {
    const code = globalThis.localStorage?.getItem(KEY) ?? null;
    if (code) globalThis.localStorage?.removeItem(KEY);
    return code;
  } catch {
    return null;
  }
}
