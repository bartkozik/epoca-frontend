import { useIntegrationClientQuery } from '@/modules/integrationClients/hooks/useIntegrationClientQuery';
import { useUpdateIntegrationClientMutation } from '@/modules/integrationClients/hooks/useUpdateIntegrationClientMutation';
import { integrationClientQueryKey, integrationClientsQueryKey } from '@/modules/integrationClients/queryKeys';
import * as requests from '@/modules/integrationClients/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/integrationClients/requests', () => ({
  updateIntegrationClient: vi.fn(),
  getIntegrationClient: vi.fn(),
}));
const updateIntegrationClientMock = requests.updateIntegrationClient as unknown as ReturnType<typeof vi.fn>;
const getIntegrationClientMock = requests.getIntegrationClient as unknown as ReturnType<typeof vi.fn>;

const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe('useUpdateIntegrationClientMutation', () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const clientId = 'epoca_oauth_client_v1_contract';
  const updatedClient = { clientId, name: 'Renamed', version: 5 };

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    vi.clearAllMocks();
  });

  it('updates a client, refreshes its detail cache, and invalidates the list', async () => {
    updateIntegrationClientMock.mockResolvedValueOnce(updatedClient);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateIntegrationClientMutation(), { wrapper });
    result.current.mutate({ organizationSlug: 'acme', clientId, input: { expectedVersion: 4, name: 'Renamed' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(updateIntegrationClientMock).toHaveBeenCalledWith('acme', clientId, {
      expectedVersion: 4,
      name: 'Renamed',
    });
    expect(queryClient.getQueryData(integrationClientQueryKey('acme', clientId))).toEqual(updatedClient);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['integrationClients', 'acme'], exact: false });
  });

  it('surfaces a stale-version conflict as a typed problem', async () => {
    updateIntegrationClientMock.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 409,
        data: { type: 'result:oauth-client:stale-version', extension: { currentVersion: 6 } },
      },
    });

    const { result } = renderHook(() => useUpdateIntegrationClientMutation(), { wrapper });
    result.current.mutate({ organizationSlug: 'acme', clientId, input: { expectedVersion: 4, name: 'Renamed' } });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({ kind: 'stale-version', status: 409, currentVersion: 6 });
  });

  it('evicts the client from list caches on a client-not-found error', async () => {
    const listKey = integrationClientsQueryKey('acme', { pageNumber: 1, pageSize: 20 });
    queryClient.setQueryData(listKey, { count: 1, results: [{ clientId, name: 'stale' }] });
    updateIntegrationClientMock.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 404, data: { type: 'result:oauth-client:client-not-found' } },
    });

    const { result } = renderHook(() => useUpdateIntegrationClientMutation(), { wrapper });
    result.current.mutate({ organizationSlug: 'acme', clientId, input: { expectedVersion: 4, name: 'Renamed' } });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(listKey)).toEqual({ count: 0, results: [] });
  });

  it('writes each result under the organization it was submitted for, even when a save for a different organization resolves first', async () => {
    const acmeClient = { clientId, name: 'Acme rename', version: 5 };
    const otherClient = { clientId, name: 'Other rename', version: 5 };
    const acmeSave = deferred<typeof acmeClient>();
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    updateIntegrationClientMock.mockImplementation((organizationSlug: string) =>
      organizationSlug === 'acme' ? acmeSave.promise : Promise.resolve(otherClient),
    );

    const { result } = renderHook(() => useUpdateIntegrationClientMutation(), { wrapper });
    const acmeMutation = result.current.mutateAsync({
      organizationSlug: 'acme',
      clientId,
      input: { expectedVersion: 4, name: 'Acme rename' },
    });
    await result.current.mutateAsync({
      organizationSlug: 'other-org',
      clientId,
      input: { expectedVersion: 4, name: 'Other rename' },
    });

    expect(queryClient.getQueryData(integrationClientQueryKey('other-org', clientId))).toEqual(otherClient);
    expect(queryClient.getQueryData(integrationClientQueryKey('acme', clientId))).toBeUndefined();

    acmeSave.resolve(acmeClient);
    await acmeMutation;

    expect(queryClient.getQueryData(integrationClientQueryKey('acme', clientId))).toEqual(acmeClient);
    expect(queryClient.getQueryData(integrationClientQueryKey('other-org', clientId))).toEqual(otherClient);
  });

  it('does not let an in-flight details fetch overwrite a save that completed while it was pending', async () => {
    const clientV1 = { clientId, name: 'Reporting warehouse', version: 1 };
    const clientV2 = { clientId, name: 'Renamed', version: 2 };
    const detailsGet = deferred<typeof clientV1>();
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    getIntegrationClientMock.mockImplementationOnce(() => detailsGet.promise);
    updateIntegrationClientMock.mockResolvedValueOnce(clientV2);

    const { result } = renderHook(
      () => ({
        details: useIntegrationClientQuery('acme', clientId),
        update: useUpdateIntegrationClientMutation(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(getIntegrationClientMock).toHaveBeenCalledTimes(1));

    await result.current.update.mutateAsync({
      organizationSlug: 'acme',
      clientId,
      input: { expectedVersion: 1, name: 'Renamed' },
    });
    expect(queryClient.getQueryData(integrationClientQueryKey('acme', clientId))).toEqual(clientV2);

    detailsGet.resolve(clientV1);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(queryClient.getQueryData(integrationClientQueryKey('acme', clientId))).toEqual(clientV2);
    expect(result.current.details.data).toEqual(clientV2);
  });
});
