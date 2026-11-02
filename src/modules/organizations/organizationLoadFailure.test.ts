import { classifyOrganizationLoadFailure } from './organizationLoadFailure';

const axiosError = (status?: number): Error => {
  const error = new Error('organizations failed') as Error & {
    isAxiosError: boolean;
    response?: { status: number };
  };
  error.isAxiosError = true;
  if (status !== undefined) error.response = { status };
  return error;
};

it.each([
  [401, 'unauthorized'],
  [403, 'forbidden'],
  [400, 'request'],
  [404, 'request'],
  [500, 'temporary'],
  [503, 'temporary'],
] as const)('classifies HTTP %i as %s', (status, expected) => {
  expect(classifyOrganizationLoadFailure(axiosError(status))).toEqual({ kind: expected, status });
});

it('classifies an Axios error without a response as temporary', () => {
  expect(classifyOrganizationLoadFailure(axiosError())).toEqual({ kind: 'temporary', status: null });
});

it('classifies an unknown thrown value as temporary', () => {
  expect(classifyOrganizationLoadFailure(new Error('unexpected'))).toEqual({ kind: 'temporary', status: null });
});
