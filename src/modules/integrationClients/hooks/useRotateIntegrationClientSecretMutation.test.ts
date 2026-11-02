import {
  useRevokeIntegrationClientMutation,
  useRotateIntegrationClientSecretMutation,
} from '@/modules/integrationClients/hooks/useRotateIntegrationClientSecretMutation';
import { integrationClientQueryKey, integrationClientsQueryKey } from '@/modules/integrationClients/queryKeys';
import * as requests from '@/modules/integrationClients/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/integrationClients/requests', () => ({
  rotateIntegrationClientSecret: vi.fn(),
  revokeIntegrationClient: vi.fn(),
}));
const rotateIntegrationClientSecretMock = requests.rotateIntegrationClientSecret as unknown as ReturnType<typeof vi.fn>;
const revokeIntegrationClientMock = requests.revokeIntegrationClient as unknown as ReturnType<typeof vi.fn>;

const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const clientId = 'epoca_oauth_client_v1_contract';

describe('rotate/revoke mutations', () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    vi.clearAllMocks();
  });

  it('rotate: caches the returned client and invalidates the list', async () => {
    const rotatedClient = { clientId, name: 'Reporting warehouse', version: 5 };
    rotateIntegrationClientSecretMock.mockResolvedValueOnce({ client: rotatedClient, clientSecret: 'new-secret' });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useRotateIntegrationClientSecretMutation(), { wrapper });
    result.current.mutate({ organizationSlug: 'acme', clientId, expectedVersion: 4 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rotateIntegrationClientSecretMock).toHaveBeenCalledWith('acme', clientId, 4);
    expect(queryClient.getQueryData(integrationClientQueryKey('acme', clientId))).toEqual(rotatedClient);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['integrationClients', 'acme'], exact: false });
  });

  it('revoke: caches the returned client and invalidates the list', async () => {
    const revokedClient = { clientId, name: 'Reporting warehouse', version: 5, status: 'Revoked' };
    revokeIntegrationClientMock.mockResolvedValueOnce(revokedClient);

    const { result } = renderHook(() => useRevokeIntegrationClientMutation(), { wrapper });
    result.current.mutate({ organizationSlug: 'acme', clientId, expectedVersion: 4 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(revokeIntegrationClientMock).toHaveBeenCalledWith('acme', clientId, 4);
    expect(queryClient.getQueryData(integrationClientQueryKey('acme', clientId))).toEqual(revokedClient);
  });

  it('revoke: evicts the client from list caches on a client-not-found error', async () => {
    const listKey = integrationClientsQueryKey('acme', { pageNumber: 1, pageSize: 20 });
    queryClient.setQueryData(listKey, { count: 1, results: [{ clientId, name: 'stale' }] });
    revokeIntegrationClientMock.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 404, data: { type: 'result:oauth-client:client-not-found' } },
    });

    const { result } = renderHook(() => useRevokeIntegrationClientMutation(), { wrapper });
    result.current.mutate({ organizationSlug: 'acme', clientId, expectedVersion: 4 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(listKey)).toEqual({ count: 0, results: [] });
  });

  it('rejects locally without calling the API when expectedVersion is invalid', async () => {
    const { result } = renderHook(() => useRotateIntegrationClientSecretMutation(), { wrapper });
    result.current.mutate({ organizationSlug: 'acme', clientId, expectedVersion: 0 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rotateIntegrationClientSecretMock).not.toHaveBeenCalled();
    expect(result.current.error).toEqual({ kind: 'unexpected', status: null });
  });

  // Same rationale as integrationClientUpdateMutation.model.test.ts: organizationSlug now travels
  // in the mutation's own variables, so a rotate submitted for one organization can't have its
  // result land in another organization's cache no matter what resolves first.
  it('rotate: writes each result under the organization it was submitted for, even when a rotate for a different organization resolves first', async () => {
    const acmeClient = { clientId, name: 'Reporting warehouse', version: 5 };
    const otherClient = { clientId, name: 'Reporting warehouse', version: 5 };
    const acmeRotate = deferred<{ client: typeof acmeClient; clientSecret: string }>();
    // Same rationale as integrationClientGetQuery.model.test.ts's overlapping-fetch test.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    rotateIntegrationClientSecretMock.mockImplementation((organizationSlug: string) =>
      organizationSlug === 'acme' ? acmeRotate.promise : Promise.resolve({ client: otherClient, clientSecret: 'x' }),
    );

    const { result } = renderHook(() => useRotateIntegrationClientSecretMutation(), { wrapper });
    const acmeMutation = result.current.mutateAsync({ organizationSlug: 'acme', clientId, expectedVersion: 4 });
    await result.current.mutateAsync({ organizationSlug: 'other-org', clientId, expectedVersion: 4 });

    expect(queryClient.getQueryData(integrationClientQueryKey('other-org', clientId))).toEqual(otherClient);
    expect(queryClient.getQueryData(integrationClientQueryKey('acme', clientId))).toBeUndefined();

    acmeRotate.resolve({ client: acmeClient, clientSecret: 'new-secret' });
    await acmeMutation;

    expect(queryClient.getQueryData(integrationClientQueryKey('acme', clientId))).toEqual(acmeClient);
    expect(queryClient.getQueryData(integrationClientQueryKey('other-org', clientId))).toEqual(otherClient);
  });
});
