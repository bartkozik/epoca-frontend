import { getCorrelationIdFromError } from './get-correlation-id-from-error';

describe('getCorrelationIdFromError', () => {
  it('reads the Correlation-Id header off an axios error', () => {
    const error = {
      config: {},
      isAxiosError: true,
      response: { config: { headers: { 'Correlation-Id': 'abc-123' } } },
    };

    expect(getCorrelationIdFromError(error)).toBe('abc-123');
  });

  it('returns "unknown" when the header is missing', () => {
    const error = { config: {}, isAxiosError: true, response: { config: { headers: {} } } };

    expect(getCorrelationIdFromError(error)).toBe('unknown');
  });

  it('returns "unknown" for a non-axios value without throwing', () => {
    expect(getCorrelationIdFromError('not an error')).toBe('unknown');
    expect(getCorrelationIdFromError(null)).toBe('unknown');
    expect(getCorrelationIdFromError(undefined)).toBe('unknown');
  });
});
