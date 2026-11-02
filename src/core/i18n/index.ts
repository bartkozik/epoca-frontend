import en from './locales/en/translation.json';
import pl from './locales/pl/translation.json';

export const resources = {
  en: {
    translation: en,
  },
  pl: {
    translation: pl,
  },
};

//After adding the new language add it to domain/type/Language enum

export const availableLanguages = ['en', 'pl'];
