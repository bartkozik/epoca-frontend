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

const decodeJwtPayload = (token: string): unknown => {
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

export const decodeSessionFromToken = (token: string): Session | null => {
  const decoded = decodeJwtPayload(token);
  if (decoded === null) return null;

  const validated = sessionSchema.safeParse({ token, user: decoded });
  return validated.success ? validated.data : null;
};

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

export const getDeviceId = (): string => {
  return localStorage.getItem(LOCAL_STORAGE_AUTH_NAME.DEVICE_ID) || '';
};

export const saveDeviceId = (): void | undefined => {
  if (getDeviceId()) return;
  localStorage.setItem(LOCAL_STORAGE_AUTH_NAME.DEVICE_ID, uuid4());
};
