const LOCAL_STORAGE_APP_NAME = 'IteratorsEpoca';

export const LOCAL_STORAGE_AUTH_NAME = {
  ACCESS_TOKEN: `${LOCAL_STORAGE_APP_NAME}__auth__access_tok_${window.location.hostname}`,
  DEVICE_ID: `${LOCAL_STORAGE_APP_NAME}__auth__device_id_${window.location.hostname}`,
  REFRESH_TOKEN: `${LOCAL_STORAGE_APP_NAME}__auth__ref_tok_${window.location.hostname}`,
  CONTEXT_ORG_SLUG: `${LOCAL_STORAGE_APP_NAME}__org__slug_${window.location.hostname}`,
  CONTEXT_ORG_ID: `${LOCAL_STORAGE_APP_NAME}__org__id_${window.location.hostname}`,
  DEMO_USER_LANGUAGE: `${LOCAL_STORAGE_APP_NAME}__demo__user__lang_${window.location.hostname}`,
  USER_LANGUAGE: `${LOCAL_STORAGE_APP_NAME}__user__lang_${window.location.hostname}`,
};
