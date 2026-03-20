import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslation from './en/translation.json';
import arTranslation from './ar/translation.json';

export const I18N_STORAGE_KEY = 'aibreaker_language';

export const SUPPORTED_LANGUAGES = {
  en: { code: 'en', dir: 'ltr' },
  ar: { code: 'ar', dir: 'rtl' },
};

function getStoredLanguage() {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(I18N_STORAGE_KEY);
  return stored && SUPPORTED_LANGUAGES[stored] ? stored : 'en';
}

export function getLanguageDirection(language = 'en') {
  return SUPPORTED_LANGUAGES[language]?.dir || 'ltr';
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: enTranslation },
    ar: { translation: arTranslation },
  },
  lng: getStoredLanguage(),
  fallbackLng: 'en',
  supportedLngs: Object.keys(SUPPORTED_LANGUAGES),
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
  returnNull: false,
});

if (typeof window !== 'undefined') {
  i18n.on('languageChanged', (language) => {
    window.localStorage.setItem(I18N_STORAGE_KEY, language);
  });
}

export default i18n;
