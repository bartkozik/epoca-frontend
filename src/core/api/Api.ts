import env from '@/core/config/env';
import { getCorrelationIdFromError, isAxiosError } from '@/core/utils/helpers';
import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { v4 as uuidv4 } from 'uuid';
import { serializeParams } from './paramsSerializer';
import { shouldSendResponseErrorLog } from './responseError';
import { getRefreshedAccessToken } from './tokenRefresh';
import {
  decodeSessionFromToken,
  getDeviceId,
  getRefreshToken,
  handleConnectionError,
  isAccessTokenValid,
  readStoredSession,
  removeAPICredentials,
  sendErrorLogToServer,
} from './utils';

dayjs.extend(isSameOrBefore);

const mergeHeaders = (
  config: InternalAxiosRequestConfig,
  headers: Record<string, string>,
): InternalAxiosRequestConfig => {
  const mergedHeaders = new AxiosHeaders(AxiosHeaders.from(config.headers));

  Object.entries(headers).forEach(([name, value]) => mergedHeaders.set(name, value));

  return {
    ...config,
    headers: mergedHeaders,
  };
};

const runBestEffort = (sideEffect: () => unknown): void => {
  try {
    void Promise.resolve(sideEffect()).catch(() => undefined);
  } catch {
    // Optional error side effects must never replace the original rejection.
  }
};

const api = axios.create({
  baseURL: env.backendUrl,
  paramsSerializer: serializeParams,
});

// A separate client avoids recursively reporting errors from api's request interceptor.
export const errorLoggingApi = axios.create({
  baseURL: env.backendUrl,
  paramsSerializer: serializeParams,
});

export const buildErrorLoggingHeaders = (): Record<string, string> => {
  const storedSession = readStoredSession();
  const session = storedSession.status === 'valid' ? storedSession.session : null;

  const headers: Record<string, string> = {
    'device-id': getDeviceId(),
    'Correlation-Id': uuidv4(),
  };
  if (session && isAccessTokenValid(session)) headers.Authorization = `Bearer ${session.token}`;

  return headers;
};

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    return new Promise((resolve, reject) => {
      const correlationId = uuidv4();
      const defaultHeaders = {
        'device-id': getDeviceId(),
        'Correlation-Id': correlationId,
      };

      if (config.authPolicy?.mode === 'explicit') {
        const { token } = config.authPolicy;
        const session = token ? decodeSessionFromToken(token) : null;
        const resolved = mergeHeaders(config, defaultHeaders);
        resolved.headers.delete('Authorization');
        delete resolved.auth;
        if (session && isAccessTokenValid(session)) resolved.headers.set('Authorization', `Bearer ${token}`);
        return resolve(resolved);
      }

      // Refresh requests must use their own token without triggering another refresh.
      if (config.url === '/auth/refresh-token') {
        return resolve(mergeHeaders(config, defaultHeaders));
      }

      const storedSession = readStoredSession();
      const refreshToken = getRefreshToken();

      if (storedSession.status === 'unreadable') {
        void sendErrorLogToServer(correlationId, `Unreadable stored session: ${storedSession.reason}`);
        removeAPICredentials();
      }

      const session = storedSession.status === 'valid' ? storedSession.session : null;

      if (session && isAccessTokenValid(session)) {
        return resolve(
          mergeHeaders(config, {
            ...defaultHeaders,
            Authorization: `Bearer ${session.token}` || '',
          }),
        );
      } else if (refreshToken) {
        void getRefreshedAccessToken(refreshToken).then(
          (accessToken) =>
            resolve(
              mergeHeaders(config, {
                ...defaultHeaders,
                Authorization: `Bearer ${accessToken}`,
              }),
            ),
          reject,
        );
      } else {
        return resolve(mergeHeaders(config, defaultHeaders));
      }
    });
  },
  (err: unknown) => Promise.reject(err instanceof Error ? err : new Error(String(err))),
);

api.interceptors.response.use(
  (response) => Promise.resolve(response),
  (error) => {
    runBestEffort(() => {
      if (shouldSendResponseErrorLog(error) && isAxiosError(error) && error.response) {
        return sendErrorLogToServer(getCorrelationIdFromError(error), error.response.data as string);
      }
    });

    runBestEffort(() => {
      if (!isAxiosError(error) || !error.config?.skipConnectionErrorToast) handleConnectionError(error);
    });
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  },
);

export default api;
