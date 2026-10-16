import 'i18next';

import type it from './locales/it.json';

// Fa sì che TypeScript segnali una chiave di traduzione scritta male.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof it };
  }
}
