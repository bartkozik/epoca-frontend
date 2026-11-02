// CT-540: hoisted out of modules/auth/constants.ts — core/api/utils.ts is the primary owner of
// this registry (ACCESS_TOKEN, REFRESH_TOKEN, DEVICE_ID all back the token lifecycle it manages);
// CONTEXT_ORG_SLUG and USER_LANGUAGE are used by modules/organizations and modules/auth
// respectively, which stay free to import them from core like any other core constant.
const LOCAL_STORAGE_APP_NAME = 'IteratorsEpoca';

export const LOCAL_STORAGE_AUTH_NAME = {
  ACCESS_TOKEN: `${LOCAL_STORAGE_APP_NAME}__auth__access_tok_${window.location.hostname}`,
  DEVICE_ID: `${LOCAL_STORAGE_APP_NAME}__auth__device_id_${window.location.hostname}`,
  REFRESH_TOKEN: `${LOCAL_STORAGE_APP_NAME}__auth__ref_tok_${window.location.hostname}`,
  CONTEXT_ORG_SLUG: `${LOCAL_STORAGE_APP_NAME}__org__slug_${window.location.hostname}`,
  CONTEXT_ORG_ID: `${LOCAL_STORAGE_APP_NAME}__org__id_${window.location.hostname}`,
  USER_LANGUAGE: `${LOCAL_STORAGE_APP_NAME}__user__lang_${window.location.hostname}`,
};
