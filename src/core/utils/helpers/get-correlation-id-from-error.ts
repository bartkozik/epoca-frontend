import { isAxiosError } from './is-axios-error';

export const getCorrelationIdFromError = (err: unknown): string => {
  if (!isAxiosError(err)) return 'unknown';

  const headers = err.response?.config.headers ?? {};
  const correlationId = 'Correlation-Id' in headers ? headers['Correlation-Id'] : undefined;
  return typeof correlationId === 'string' && correlationId ? correlationId : 'unknown';
};
