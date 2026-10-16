import it from './locales/it.json';

// Per aggiungere una lingua: crea locales/en.json con le stesse chiavi e aggiungilo qui.
export const resources = {
  it: { translation: it },
} as const;

export const supportedLanguages = Object.keys(resources) as (keyof typeof resources)[];
export const fallbackLanguage = 'it';

/** Sceglie la prima lingua del telefono che l'app supporta, altrimenti l'italiano. */
export function pickLanguage(deviceLanguages: (string | null | undefined)[]): string {
  for (const code of deviceLanguages) {
    if (code && (supportedLanguages as string[]).includes(code)) return code;
  }
  return fallbackLanguage;
}
