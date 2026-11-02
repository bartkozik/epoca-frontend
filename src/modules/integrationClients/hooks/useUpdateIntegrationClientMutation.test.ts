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

  // Regression test for a confirmed race: organizationSlug used to be a hook argument closed over
  // by mutationFn/onSuccess, so those callbacks ran with whatever organization the component had
  // re-rendered to by the time the save resolved -- a save started in 'acme' could land in whatever
  // organization the user had since switched to, and 'acme's own list/detail cache never refreshed.
  // organizationSlug now travels in the mutation's own variables, so each call's result is written
  // using the organization it was actually submitted for, regardless of what resolves first.
  it('writes each result under the organization it was submitted for, even when a save for a different organization resolves first', async () => {
    const acmeClient = { clientId, name: 'Acme rename', version: 5 };
    const otherClient = { clientId, name: 'Other rename', version: 5 };
    const acmeSave = deferred<typeof acmeClient>();
    // Same rationale as integrationClientGetQuery.model.test.ts's overlapping-fetch test.
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

  // Regression test for a confirmed race: the details modal keeps its GET query mounted with
  // staleTime: 0, so opening it starts a network read that can still be in flight when a save
  // completes. Without cancelling that read first, its (older) response can resolve after the
  // save's onSuccess and silently roll the cache back -- reproduced here as a version-2-to-1
  // rollback -- leaving the UI showing stale details and a follow-up action hitting a stale-version
  // conflict against data the user never actually saw change.
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

    // Resolving the earlier GET now, after the save already completed, is the reproduction: without
    // cancelling it first, this is exactly what rolls the cache back from v2 to v1.
    detailsGet.resolve(clientV1);
    // Flush the now-settled promise's microtasks (and any macrotask react-query schedules off of
    // it) before asserting nothing changed -- otherwise a still-pending overwrite could pass
    // unnoticed if we asserted immediately.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(queryClient.getQueryData(integrationClientQueryKey('acme', clientId))).toEqual(clientV2);
    expect(result.current.details.data).toEqual(clientV2);
  });
});
