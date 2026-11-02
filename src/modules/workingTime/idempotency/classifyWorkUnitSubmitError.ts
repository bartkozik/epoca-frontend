import { isAxiosError } from '@/core/utils/helpers/is-axios-error';

export type WorkUnitSubmitErrorDecision = 'retain-key' | 'rotate-key' | 'block-expired' | 'block-version-unsupported';

const VERSION_UNSUPPORTED = 'result:work-unit:idempotency-version-unsupported';
const RESULT_EXPIRED = 'result:work-unit:idempotency-result-expired';
const KEY_CONFLICT = 'result:work-unit:idempotency-key-conflict';

const getProblemType = (data: unknown): string | undefined => {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return undefined;
  }

  const type = (data as Record<string, unknown>).type;

  return typeof type === 'string' ? type : undefined;
};

export const classifyWorkUnitSubmitError = (error: unknown): WorkUnitSubmitErrorDecision => {
  if (!isAxiosError(error) || error.message === 'Network Error' || error.code === 'ECONNABORTED' || !error.response) {
    return 'retain-key';
  }

  const { data, status } = error.response;
  const problemType = getProblemType(data);

  if (status === 409 && problemType === VERSION_UNSUPPORTED) {
    return 'block-version-unsupported';
  }

  if (status === 410 && problemType === RESULT_EXPIRED) {
    return 'block-expired';
  }

  if (status === 409 && problemType === KEY_CONFLICT) {
    return 'rotate-key';
  }

  if (status === 408 || status === 429 || (status >= 500 && status <= 599)) {
    return 'retain-key';
  }

  if (status >= 400 && status <= 499 && problemType?.startsWith('result:')) {
    return 'rotate-key';
  }

  return 'retain-key';
};
