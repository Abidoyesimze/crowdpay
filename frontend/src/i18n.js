import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

// 'en' is bundled eagerly since it's the fallback language and near-guaranteed
// to be needed. Other locales are code-split and fetched only when selected.
const lazyLocaleLoaders = {
  fr: () => import('./locales/fr.json'),
};

const lazyLocaleBackend = {
  type: 'backend',
  init() {},
  read(language, _namespace, callback) {
    const loadLocale = lazyLocaleLoaders[language];
    if (!loadLocale) {
      callback(new Error(`Unsupported language: ${language}`), false);
      return;
    }
    loadLocale()
      .then((module) => callback(null, module.default))
      .catch((err) => callback(err, false));
  },
};

i18n
  .use(lazyLocaleBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    partialBundledLanguages: true,
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr'],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
    returnEmptyString: false,
    returnNull: false,
    react: {
      useSuspense: false,
    },
  });

export default i18n;
