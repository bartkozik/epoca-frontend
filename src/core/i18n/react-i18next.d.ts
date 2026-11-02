import 'react-i18next';
import en from './locales/en/translation.json';

type DefaultNamespace = typeof en;

declare module 'react-i18next' {
  interface Resources {
    translation: DefaultNamespace;
  }
}
