import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import fr from './locales/fr.json';

export const supportedLanguages = ['en', 'fr'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const rtlLanguages: SupportedLanguage[] = [];

export const languageOptions: Array<{
  value: SupportedLanguage;
  label: string;
  compactLabel: string;
}> = [
  { value: 'en', label: 'English', compactLabel: 'EN' },
  { value: 'fr', label: 'Français', compactLabel: 'FR' },
];

export function resolveSupportedLanguage(lang?: string): SupportedLanguage {
  const value = (lang || 'en').toLowerCase();
  if (value === 'fr' || value.startsWith('fr-')) return 'fr';
  return 'en';
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    fallbackLng: 'en',
    supportedLngs: supportedLanguages as unknown as string[],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'wa_campaigns_language',
      caches: ['localStorage'],
      convertDetectedLanguage: (lang: string) => resolveSupportedLanguage(lang),
    },
    react: { useSuspense: false },
  });

function applyDirection(lang: string) {
  const resolved = resolveSupportedLanguage(lang);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = resolved;
    document.documentElement.dir = 'ltr';
  }
}

applyDirection(i18n.language);
i18n.on('languageChanged', applyDirection);

export default i18n;
