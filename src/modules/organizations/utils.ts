import { LOCAL_STORAGE_AUTH_NAME } from '@/core/config/localStorageKeys';

export const saveContextOrganizationSlugInLS = (slug: string): void => {
  localStorage.setItem(LOCAL_STORAGE_AUTH_NAME.CONTEXT_ORG_SLUG, slug);
};

export const removeContextOrganizationSlugFromLS = (): void => {
  localStorage.removeItem(LOCAL_STORAGE_AUTH_NAME.CONTEXT_ORG_SLUG);
};

export const getContextOrganizationSlugFromLS = (): string | null => {
  return localStorage.getItem(LOCAL_STORAGE_AUTH_NAME.CONTEXT_ORG_SLUG);
};

export const saveContextOrganizationIdInLS = (id: string): void => {
  localStorage.setItem(LOCAL_STORAGE_AUTH_NAME.CONTEXT_ORG_ID, id);
};

export const removeContextOrganizationIdFromLS = (): void => {
  localStorage.removeItem(LOCAL_STORAGE_AUTH_NAME.CONTEXT_ORG_ID);
};

export const getContextOrganizationIdFromLS = (): string | null => {
  return localStorage.getItem(LOCAL_STORAGE_AUTH_NAME.CONTEXT_ORG_ID);
};
