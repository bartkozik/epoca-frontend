import { classifySamlAuthCheckFailure } from './samlAuthCheckFailure';

const axiosError = (status?: number): Error => {
  const error = new Error('saml auth check failed') as Error & {
    isAxiosError: boolean;
    response?: { status: number };
  };
  error.isAxiosError = true;
  if (status !== undefined) error.response = { status };
  return error;
};

it.each([
  [400, 'unavailable'],
  [401, 'temporary'],
  [403, 'unavailable'],
  [404, 'unavailable'],
  [500, 'temporary'],
  [503, 'temporary'],
] as const)('classifies HTTP %i as %s', (status, expected) => {
  expect(classifySamlAuthCheckFailure(axiosError(status))).toEqual({ kind: expected, status });
});

it('classifies an Axios error without a response as temporary', () => {
  expect(classifySamlAuthCheckFailure(axiosError())).toEqual({ kind: 'temporary', status: null });
});

it('classifies an unknown thrown value as temporary', () => {
  expect(classifySamlAuthCheckFailure(new Error('unexpected'))).toEqual({ kind: 'temporary', status: null });
});
