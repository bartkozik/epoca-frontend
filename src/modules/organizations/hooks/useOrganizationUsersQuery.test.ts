import { useOrganizationUsersQuery } from '@/modules/organizations/hooks/useOrganizationUsersQuery';
import { organizationUsersQueryKey } from '@/modules/organizations/queryKeys';
import * as requests from '@/modules/organizations/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/organizations/requests', () => ({ getOrganizationUsers: vi.fn() }));
const getOrganizationUsersMock = requests.getOrganizationUsers as unknown as ReturnType<typeof vi.fn>;

vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));

const rawOrganizationUser = {
  firstName: 'Jane',
  id: 'user-1',
  identities: [],
  lastName: 'Doe',
  organizationRoles: [],
  archived: false,
};

const wrapper = ({ children }: { children: ReactNode }): ReactElement => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: queryClient }, children);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('organizationUsersQueryKey', () => {
  it('is a flat key including includeArchived as a string', () => {
    expect(organizationUsersQueryKey('acme', true)).toEqual(['organizationUsers', 'acme', 'true']);
  });
});

describe('useOrganizationUsersQuery', () => {
  it('defaults includeArchived to true', async () => {
    getOrganizationUsersMock.mockResolvedValueOnce({ data: [rawOrganizationUser] });

    const { result } = renderHook(() => useOrganizationUsersQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getOrganizationUsersMock).toHaveBeenCalledWith('acme', true);
    expect(result.current.data).toEqual([rawOrganizationUser]);
  });

  it('respects an explicit includeArchived value', async () => {
    getOrganizationUsersMock.mockResolvedValueOnce({ data: [] });

    renderHook(() => useOrganizationUsersQuery(false), { wrapper });

    await waitFor(() => expect(getOrganizationUsersMock).toHaveBeenCalledWith('acme', false));
  });
});
