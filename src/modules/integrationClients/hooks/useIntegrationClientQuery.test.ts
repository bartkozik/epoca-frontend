import { useIntegrationClientQuery } from '@/modules/integrationClients/hooks/useIntegrationClientQuery';
import { integrationClientQueryKey, integrationClientsQueryKey } from '@/modules/integrationClients/queryKeys';
import * as requests from '@/modules/integrationClients/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/integrationClients/requests', () => ({ getIntegrationClient: vi.fn() }));
const getIntegrationClientMock = requests.getIntegrationClient as unknown as ReturnType<typeof vi.fn>;

const actor = {
  userId: '33333333-3333-4333-8333-333333333333',
  displayName: 'Contract Actor',
};

const validClient = {
  clientId: 'epoca_oauth_client_v1_contract',
  name: 'Reporting warehouse',
  status: 'Active' as const,
  scopes: [
    'organization:read',
    'users:read',
    'clients:read',
    'projects:read',
    'work-units:read',
    'work-units:write',
    'reports:read',
    'reports:export',
  ],
  projectAccess: {
    mode: 'SelectedProjects' as const,
    projectIds: ['11111111-1111-4111-8111-111111111111'],
  },
  version: 4,
  policyVersion: 3,
  secretVersion: 2,
  serviceAccount: {
    userId: '22222222-2222-4222-8222-222222222222',
    displayName: 'Integration Reporting warehouse',
  },
  createdAt: '2026-08-01T08:12:30Z',
  createdBy: actor,
  modifiedAt: '2026-08-19T11:42:10.123456Z',
  modifiedBy: actor,
  secretRotatedAt: '2026-08-10T09:00:00Z',
  secretRotatedBy: actor,
  expiresAt: '2026-12-31T22:59:00Z',
  revokedAt: null,
  revokedBy: null,
  lastUsedAt: null,
};

describe('useIntegrationClientQuery', () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
  });

  it('fetches a client and caches it under an organization+clientId key', async () => {
    getIntegrationClientMock.mockResolvedValueOnce(validClient);

    const { result } = renderHook(() => useIntegrationClientQuery('acme', validClient.clientId), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(validClient);
    expect(queryClient.getQueryData(integrationClientQueryKey('acme', validClient.clientId))).toEqual(validClient);
  });

  it('evicts the client from every cached list page on a client-not-found error', async () => {
    const listKey = integrationClientsQueryKey('acme', { pageNumber: 1, pageSize: 20 });
    queryClient.setQueryData(listKey, { count: 1, results: [validClient] });
    getIntegrationClientMock.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 404, data: { type: 'result:oauth-client:client-not-found' } },
    });

    const { result } = renderHook(() => useIntegrationClientQuery('acme', validClient.clientId), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({ kind: 'client-not-found', status: 404 });
    expect(queryClient.getQueryData(listKey)).toEqual({ count: 0, results: [] });
  });

  // Query keys are namespaced by clientId, so two clients' detail fetches -- even overlapping,
  // resolving out of order -- land in independent cache entries rather than one clobbering the
  // other. This is the replacement for IntegrationClientsStore's hand-rolled per-client read
  // sequence tracking (clientReadSequences).
  it('keeps independent cache entries per clientId when fetches for two different clients overlap', async () => {
    const deferred = (): { promise: Promise<typeof validClient>; resolve: (value: typeof validClient) => void } => {
      let resolve: (value: typeof validClient) => void = () => undefined;
      const promise = new Promise<typeof validClient>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    };
    const first = deferred();
    const second = deferred();
    // getIntegrationClientMock's loosened `unknown as ReturnType<typeof vi.fn>` cast (matching this
    // repo's established mocking pattern) infers mockImplementationOnce's callback as void-returning,
    // so eslint can't see it actually matches getIntegrationClient's real Promise-returning signature.
    getIntegrationClientMock
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      .mockImplementationOnce(() => first.promise)
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      .mockImplementationOnce(() => second.promise);
    const secondClientId = `${validClient.clientId}-other`;

    renderHook(() => useIntegrationClientQuery('acme', validClient.clientId), { wrapper });
    renderHook(() => useIntegrationClientQuery('acme', secondClientId), { wrapper });
    await waitFor(() => expect(getIntegrationClientMock).toHaveBeenCalledTimes(2));

    // Resolve the second client's fetch first, then the first client's -- out of order.
    second.resolve({ ...validClient, clientId: secondClientId, name: 'Second client' });
    first.resolve({ ...validClient, name: 'First client' });

    await waitFor(() =>
      expect(queryClient.getQueryData(integrationClientQueryKey('acme', secondClientId))).toMatchObject({
        name: 'Second client',
      }),
    );
    expect(queryClient.getQueryData(integrationClientQueryKey('acme', validClient.clientId))).toMatchObject({
      name: 'First client',
    });
  });
});
