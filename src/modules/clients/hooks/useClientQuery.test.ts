import { useClientQuery } from '@/modules/clients/hooks/useClientQuery';
import { clientQueryKey } from '@/modules/clients/queryKeys';
import * as requests from '@/modules/clients/requests';
import { ClientType } from '@/modules/clients/types';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/clients/requests', () => ({ getClient: vi.fn() }));
const getClientMock = requests.getClient as unknown as ReturnType<typeof vi.fn>;

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

describe('clientQueryKey', () => {
  it('is a flat key of the entity prefix, the organization slug, and the client id', () => {
    expect(clientQueryKey('acme', 'client-1')).toEqual(['client', 'acme', 'client-1']);
  });
});

describe('useClientQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the single client parsed from the list-by-id response', async () => {
    getClientMock.mockResolvedValueOnce({ data: { count: 1, results: [rawClient] } });

    const { result } = renderHook(() => useClientQuery('client-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getClientMock).toHaveBeenCalledWith('acme', 'client-1');
    expect(result.current.data).toEqual(rawClient);
  });

  it('is disabled (does not fetch) when clientId is undefined', () => {
    const { result } = renderHook(() => useClientQuery(undefined), { wrapper });

    expect(getClientMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});
