import { useClientsQuery } from '@/modules/clients/hooks/useClientsQuery';
import { clientsQueryKey } from '@/modules/clients/queryKeys';
import * as requests from '@/modules/clients/requests';
import { ClientType } from '@/modules/clients/types';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/clients/requests', () => ({ getClients: vi.fn() }));
const getClientsMock = requests.getClients as unknown as ReturnType<typeof vi.fn>;

vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));

const rawClient = {
  archivedAt: '',
  color: '#000000',
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'user-1',
  id: 'client-1',
  logo: '',
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: 'user-1',
  name: 'Acme',
  organizationId: 'org-1',
  projectCount: 0,
  texture: 'texture-1',
  type: ClientType.External,
};

const wrapper = ({ children }: { children: ReactNode }): ReactElement => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('clientsQueryKey', () => {
  it('is a flat, entity-prefixed key that serializes the dto', () => {
    expect(clientsQueryKey({ organizationSlug: 'acme', includeArchived: true })).toEqual([
      'clients',
      JSON.stringify({ organizationSlug: 'acme', includeArchived: true }),
    ]);
  });
});

describe('useClientsQuery', () => {
  it('fetches with includeArchived/includeArchivedConnections always true and returns parsed results', async () => {
    getClientsMock.mockResolvedValueOnce({ data: { count: 1, results: [rawClient] } });

    const { result } = renderHook(() => useClientsQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getClientsMock).toHaveBeenCalledWith({
      organizationSlug: 'acme',
      includeArchived: true,
      includeArchivedConnections: true,
    });
    expect(result.current.data?.results).toEqual([rawClient]);
  });
});
