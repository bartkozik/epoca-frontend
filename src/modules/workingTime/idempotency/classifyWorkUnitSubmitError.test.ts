import { classifyWorkUnitSubmitError, WorkUnitSubmitErrorDecision } from './classifyWorkUnitSubmitError';

interface AxiosErrorFixtureOptions {
  code?: string;
  data?: unknown;
  message?: string;
  status?: number;
}

const axiosError = ({ code, data, message = 'Request failed', status }: AxiosErrorFixtureOptions = {}): unknown => ({
  code,
  config: {},
  isAxiosError: true,
  message,
  name: 'AxiosError',
  request: {},
  response:
    status === undefined
      ? undefined
      : {
          config: {},
          data,
          headers: {},
          status,
          statusText: '',
        },
  toJSON: () => ({}),
});

describe('classifyWorkUnitSubmitError', () => {
  it.each([
    ['an Axios error without a response', axiosError()],
    ['a network error', axiosError({ message: 'Network Error' })],
    ['an aborted request', axiosError({ code: 'ECONNABORTED' })],
  ])('retains the key for %s', (_, error) => {
    expect(classifyWorkUnitSubmitError(error)).toBe('retain-key');
  });

  it.each([
    [
      'a network error that includes a deterministic 4xx response',
      axiosError({
        message: 'Network Error',
        status: 409,
        data: { type: 'result:work-unit:idempotency-key-conflict' },
      }),
    ],
    [
      'an aborted request that includes a deterministic 4xx response',
      axiosError({
        code: 'ECONNABORTED',
        status: 409,
        data: { type: 'result:work-unit:idempotency-version-unsupported' },
      }),
    ],
  ])('prioritizes the transport marker for %s', (_, error) => {
    expect(classifyWorkUnitSubmitError(error)).toBe('retain-key');
  });

  it.each([408, 429, 500, 501, 502, 503, 504, 599])('retains the key for retryable HTTP status %i', (status) => {
    expect(classifyWorkUnitSubmitError(axiosError({ status, data: { type: 'result:some-application-error' } }))).toBe(
      'retain-key',
    );
  });

  it.each<[number, string, WorkUnitSubmitErrorDecision]>([
    [409, 'result:work-unit:idempotency-version-unsupported', 'block-version-unsupported'],
    [410, 'result:work-unit:idempotency-result-expired', 'block-expired'],
    [409, 'result:work-unit:idempotency-key-conflict', 'rotate-key'],
  ])('classifies status %i with problem type %s as %s', (status, type, expectedDecision) => {
    expect(classifyWorkUnitSubmitError(axiosError({ status, data: { type } }))).toBe(expectedDecision);
  });

  it.each([400, 401, 403, 404, 409, 410, 422, 499])(
    'rotates the key for deterministic application error status %i',
    (status) => {
      expect(classifyWorkUnitSubmitError(axiosError({ status, data: { type: 'result:validation-error' } }))).toBe(
        'rotate-key',
      );
    },
  );

  it.each([
    ['an absent response body', undefined],
    ['an empty response object', {}],
    ['a response object without type', { detail: 'Invalid request' }],
    ['a null type', { type: null }],
    ['a numeric type', { type: 123 }],
    ['an HTML proxy response', '<html>Bad request</html>'],
    ['an unrelated URI type', { type: 'https://example.com/problems/invalid-request' }],
    ['a historical unprefixed work-unit tag', { type: 'work-unit:idempotency-key-conflict' }],
  ])('retains the key for a 4xx response with %s', (_, data) => {
    expect(classifyWorkUnitSubmitError(axiosError({ status: 409, data }))).toBe('retain-key');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a plain Error', new Error('failure')],
    ['a plain object', { message: 'failure' }],
  ])('retains the key for non-Axios input: %s', (_, error) => {
    expect(classifyWorkUnitSubmitError(error)).toBe('retain-key');
  });
});
