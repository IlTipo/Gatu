import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { fallbackLanguage, pickLanguage, resources } from './languages';

const i18n = createInstance();

i18n.use(initReactI18next).init({
  resources,
  lng: pickLanguage(getLocales().map((l) => l.languageCode)),
  fallbackLng: fallbackLanguage,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
