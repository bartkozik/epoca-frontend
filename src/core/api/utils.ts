import * as requests from '@/core/api/requests';
import { ErrorLog } from '@/core/api/types';
import { LOCAL_STORAGE_AUTH_NAME } from '@/core/config/localStorageKeys';
import type { Session } from '@/core/models/session';
import { sessionSchema } from '@/core/models/sessionSchema';
import { isAxiosError, showToastForError } from '@/core/utils/helpers';
import { AxiosResponse, isCancel } from 'axios';
import dayjs from 'dayjs';
import i18n from 'i18next';
import { v4 as uuid4 } from 'uuid';

const LEEWAY = 1;

export const isAccessTokenValid = (session: Session | null): boolean => {
  if (!session) return false;

  const currentTimeInMs = new Date().getTime();
  const accessTokenExpTimeInMs = dayjs(session.user.exp * 1000).subtract(LEEWAY, 'minute');
  return dayjs(currentTimeInMs).isSameOrBefore(accessTokenExpTimeInMs, 'minute');
};

// Never throws: returns null for a malformed JWT (wrong number of segments, invalid base64,
// invalid UTF-8, or invalid JSON) instead of letting split/atob/decodeURIComponent/JSON.parse
// throw uncaught. This is the JWT-decode half of decodeSessionFromToken below.
const decodeJwtPayload = (token: string): unknown => {
  // Guards the "never throws" guarantee unconditionally, not just for every CURRENT caller: this
  // function's own `token: string` parameter type only holds at compile time -- the accessToken/
  // refreshToken values callers pass in ultimately come from an HTTP response body. AuthTokensSchema
  // (modules/auth/models/authTokensDto.model.ts) validates that those fields are strings, but not
  // that they're well-formed JWTs, so a malformed backend response reaching here as an unparseable
  // string is a real, reachable runtime case this type annotation alone cannot prevent.
  if (typeof token !== 'string') return null;

  const segments = token.split('.');
  if (segments.length !== 3) return null;

  try {
    const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
};

// JWT -> Session, never throws. Structural failures (missing token/user.id/user.exp) return
// null; value-level tolerance (unrecognized roles/identity types) is handled inside
// sessionSchema itself, one level down, and never surfaces as a null here.
export const decodeSessionFromToken = (token: string): Session | null => {
  const decoded = decodeJwtPayload(token);
  if (decoded === null) return null;

  // Only `user.roles`' per-entry shape and the structural core (token/user.id/user.exp) are
  // Zod-validated. Every other field is trusted structurally from the real JWT payload, matching
  // the backend contract this design's spec verified directly against the backend source.
  const validated = sessionSchema.safeParse({ token, user: decoded });
  return validated.success ? validated.data : null;
};

// Access token
export const getAPICredentials = (): string | null => {
  return localStorage.getItem(LOCAL_STORAGE_AUTH_NAME.ACCESS_TOKEN);
};

export const saveSession = (token: string): Session | null => {
  const session = decodeSessionFromToken(token);
  if (!session) {
    void sendErrorLogToServer(uuid4(), `saveSession: token did not decode into a valid session`);
    return null;
  }

  localStorage.setItem(LOCAL_STORAGE_AUTH_NAME.ACCESS_TOKEN, JSON.stringify(session));

  return session;
};

export type StoredSessionResult =
  | { status: 'valid'; session: Session }
  | { status: 'absent' }
  | { status: 'unreadable'; reason: 'invalid-json' | 'invalid-shape' };

export const readStoredSession = (): StoredSessionResult => {
  const raw = getAPICredentials();
  if (!raw) return { status: 'absent' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'unreadable', reason: 'invalid-json' };
  }

  const validated = sessionSchema.safeParse(parsed);
  if (validated.success) return { status: 'valid', session: validated.data };

  // Recovery, not just rejection: the stored user is a cache of what the signed token already
  // contains -- if only the cache is bad but the token itself still decodes, re-derive from the
  // token rather than treating the whole session as unreadable.
  const rawToken = typeof parsed === 'object' && parsed !== null && 'token' in parsed ? parsed.token : undefined;
  if (typeof rawToken === 'string') {
    const recovered = decodeSessionFromToken(rawToken);
    if (recovered) return { status: 'valid', session: recovered };
  }

  return { status: 'unreadable', reason: 'invalid-shape' };
};

export function removeAPICredentials(): void {
  localStorage.removeItem(LOCAL_STORAGE_AUTH_NAME.ACCESS_TOKEN);
}

export function isNetworkError(error: unknown): boolean {
  return (
    !isCancel(error) &&
    isAxiosError(error) &&
    (!error.response || error.message === 'Network Error' || error.code === 'ECONNABORTED')
  );
}

export function handleConnectionError(error: unknown): void {
  if (isNetworkError(error))
    showToastForError({ errorMessageMap: { default: i18n.t('toast_message.error.network_error') }, error });
}

//Refresh Token
export const saveRefreshToken = (token: string): string => {
  localStorage.setItem(LOCAL_STORAGE_AUTH_NAME.REFRESH_TOKEN, token);
  return token;
};

export const removeRefreshToken = (): void => {
  localStorage.removeItem(LOCAL_STORAGE_AUTH_NAME.REFRESH_TOKEN);
};

export const getRefreshToken = (): string | null => {
  return localStorage.getItem(LOCAL_STORAGE_AUTH_NAME.REFRESH_TOKEN);
};

export const sendErrorLogToServer = (correlationId: string, errorMessage: string): Promise<AxiosResponse | void> => {
  const errorData: ErrorLog = {
    id: correlationId,
    errorMessage,
  };

  return requests.sendErrorLog(errorData).catch(() => console.error('ERROR log failed'));
};

//Device ID
export const getDeviceId = (): string => {
  return localStorage.getItem(LOCAL_STORAGE_AUTH_NAME.DEVICE_ID) || '';
};

export const saveDeviceId = (): void | undefined => {
  if (getDeviceId()) return;
  localStorage.setItem(LOCAL_STORAGE_AUTH_NAME.DEVICE_ID, uuid4());
};
