import { useCreateIntegrationClientMutation } from '@/modules/integrationClients/hooks/useCreateIntegrationClientMutation';
import { integrationClientQueryKey, integrationClientsQueryKey } from '@/modules/integrationClients/queryKeys';
import * as requests from '@/modules/integrationClients/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/integrationClients/requests', () => ({ createIntegrationClient: vi.fn() }));
const createIntegrationClientMock = requests.createIntegrationClient as unknown as ReturnType<typeof vi.fn>;

const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const validInput = {
  name: 'Reporting warehouse',
  scopes: ['reports:read'] as const,
  projectAccess: { mode: 'AllProjects' as const },
};

const createdClient = {
  clientId: 'epoca_oauth_client_v1_contract',
  name: validInput.name,
  version: 1,
};

describe('useCreateIntegrationClientMutation', () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    vi.clearAllMocks();
  });

  it('creates a client, caches its detail, and invalidates the organization list', async () => {
    createIntegrationClientMock.mockResolvedValueOnce({ client: createdClient, clientSecret: 'once' });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateIntegrationClientMutation(), { wrapper });
    result.current.mutate({ organizationSlug: 'acme', input: validInput });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createIntegrationClientMock).toHaveBeenCalledWith('acme', validInput);
    expect(queryClient.getQueryData(integrationClientQueryKey('acme', createdClient.clientId))).toEqual(createdClient);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['integrationClients', 'acme'],
      exact: false,
    });
  });

  it('rejects locally without calling the API when the input fails validation', async () => {
    const { result } = renderHook(() => useCreateIntegrationClientMutation(), { wrapper });
    result.current.mutate({ organizationSlug: 'acme', input: { ...validInput, scopes: [] } });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(createIntegrationClientMock).not.toHaveBeenCalled();
    expect(result.current.error).toEqual({ kind: 'unexpected', status: null });
  });

  it('normalizes a name-conflict error from the server', async () => {
    createIntegrationClientMock.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409, data: { type: 'result:oauth-client:name-conflict' } },
    });

    const { result } = renderHook(() => useCreateIntegrationClientMutation(), { wrapper });
    result.current.mutate({ organizationSlug: 'acme', input: validInput });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({ kind: 'name-conflict', status: 409 });
  });

  it('writes each result under the organization it was submitted for, even when a create for a different organization resolves first', async () => {
    const otherCreated = { clientId: 'epoca_oauth_client_v1_other', name: validInput.name, version: 1 };
    const acmeSave = deferred<{ client: typeof createdClient; clientSecret: string }>();
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    createIntegrationClientMock.mockImplementation((organizationSlug: string) =>
      organizationSlug === 'acme' ? acmeSave.promise : Promise.resolve({ client: otherCreated, clientSecret: 'x' }),
    );

    const { result } = renderHook(() => useCreateIntegrationClientMutation(), { wrapper });
    const acmeMutation = result.current.mutateAsync({ organizationSlug: 'acme', input: validInput });
    await result.current.mutateAsync({ organizationSlug: 'other-org', input: validInput });

    expect(queryClient.getQueryData(integrationClientQueryKey('other-org', otherCreated.clientId))).toEqual(
      otherCreated,
    );
    expect(queryClient.getQueryData(integrationClientQueryKey('acme', createdClient.clientId))).toBeUndefined();

    acmeSave.resolve({ client: createdClient, clientSecret: 'once' });
    await acmeMutation;

    expect(queryClient.getQueryData(integrationClientQueryKey('acme', createdClient.clientId))).toEqual(createdClient);
  });
});

describe('query key prefix', () => {
  it('starts with "integrationClients"', () => {
    expect(integrationClientsQueryKey('acme', { pageNumber: 1, pageSize: 20 })[0]).toBe('integrationClients');
  });
});
