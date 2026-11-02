import { isAxiosError } from './is-axios-error';

export const getCorrelationIdFromError = (err: unknown): string => {
  if (!isAxiosError(err)) return 'unknown';

  const headers = err.response?.config.headers ?? {};
  // axios's `AxiosRequestHeaders` is `RawAxiosRequestHeaders & AxiosHeaders`, and the `AxiosHeaders`
  // class carries a catch-all `[key: string]: any` index signature. That collapses this variable's
  // inferred union down to `{}` (an object type is assignable to `{}`, so TS simplifies the union),
  // which makes indexing it resolve to TS's internal "error" type rather than a plain `any` --
  // an axios type-resolution quirk, not a real type-safety gap. We set this header ourselves as a
  // string (see Api.ts's `uuidv4()`-derived 'Correlation-Id'), so asserting the read-back value is
  // a string is safe; the `||` fallback to 'unknown' for any falsy/missing value is unchanged.
  const correlationId = headers['Correlation-Id'] as string | undefined;
  return correlationId || 'unknown';
};
