import { isDemo } from '@/core/config/demo';
import { LOCAL_STORAGE_AUTH_NAME } from '@/core/config/localStorageKeys';

const getLanguageStorageKey = (): string =>
  isDemo ? LOCAL_STORAGE_AUTH_NAME.DEMO_USER_LANGUAGE : LOCAL_STORAGE_AUTH_NAME.USER_LANGUAGE;

export const saveUserLanguageInLS = (lang: string): void => {
  localStorage.setItem(getLanguageStorageKey(), lang);
};

export const removeUserLanguageFromLS = (): void => {
  localStorage.removeItem(getLanguageStorageKey());
};

export const getUserLanguageFromLS = (): string | null => {
  return localStorage.getItem(getLanguageStorageKey()) || (isDemo ? 'en' : null);
};
