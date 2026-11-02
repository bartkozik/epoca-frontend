import { LOCAL_STORAGE_AUTH_NAME } from '@/core/config/localStorageKeys';

export const saveUserLanguageInLS = (lang: string): void => {
  localStorage.setItem(LOCAL_STORAGE_AUTH_NAME.USER_LANGUAGE, lang);
};

export const removeUserLanguageFromLS = (): void => {
  localStorage.removeItem(LOCAL_STORAGE_AUTH_NAME.USER_LANGUAGE);
};

export const getUserLanguageFromLS = (): string | null => {
  return localStorage.getItem(LOCAL_STORAGE_AUTH_NAME.USER_LANGUAGE);
};
