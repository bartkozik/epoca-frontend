import { addToast } from '@/core/providers/toastProvider';
import { getCorrelationIdFromError } from '@/core/utils/helpers';
import axios, { AxiosError } from 'axios';

export const RESPONSE_ERROR_STATUS_TYPE = {
  LOGIN_NOT_FOUND: 'result:login:user-or-password-not-found',
  DUPLICATED_USER: 'result:user-create:identity-already-exist',
};

interface ErrorTypeMessages {
  [key: string]: string;
}

interface ShowErrorForToast {
  errorMessageMap: ErrorMessageMap;
  error: unknown;
  withoutCorrelationId?: boolean;
}

interface SSOErrorType {
  errorCode: string | null;
  reason: string | null;
}

interface ErrorMessageMap {
  [key: string]: ErrorTypeMessages | string;
}

export const parseUrlErrorParams = (): SSOErrorType => {
  const params = new URLSearchParams(window.location.search);
  return {
    errorCode: params.get('errorCode'),
    reason: params.get('reason'),
  };
};

export function showToastForError({
  errorMessageMap,
  error,
  withoutCorrelationId = false,
}: ShowErrorForToast): void | undefined {
  if (!axios.isAxiosError(error)) return;
  const axiosError = error as AxiosError;
  const statusCode = axiosError.response?.status;
  const toastMessage = (statusCode ? errorMessageMap[statusCode] : undefined) ?? errorMessageMap.default;

  addToast({
    content: toastMessage as string,
    correlationId: withoutCorrelationId ? undefined : getCorrelationIdFromError(axiosError),
    type: 'error',
  });
}
