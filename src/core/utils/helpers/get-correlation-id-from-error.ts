import { isAxiosError } from './is-axios-error';

export const getCorrelationIdFromError = (err: unknown): string => {
  if (!isAxiosError(err)) return 'unknown';

  const headers = err.response?.config.headers ?? {};
  const correlationId = headers['Correlation-Id'] as string | undefined;
  return correlationId || 'unknown';
};
