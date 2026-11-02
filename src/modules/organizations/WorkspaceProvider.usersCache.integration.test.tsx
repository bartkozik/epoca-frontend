import { queryClient } from '@/core/api';
import { useOrganizationUsersQuery } from '@/modules/organizations/hooks/useOrganizationUsersQuery';
import { organizationUsersQueryKey } from '@/modules/organizations/queryKeys';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import * as requests from './requests';
import { OrganizationUserRole } from './types';
import { getContextOrganizationSlugFromLS, saveContextOrganizationSlugInLS } from './utils';
import { useWorkspace, WorkspaceProvider } from './WorkspaceProvider';

const { authStateMock } = vi.hoisted(() => ({
  authStateMock: {
    loggedInUser: { id: 'user-1', email: 'ada@example.com', isSuperAdmin: false },
    loggedInUserRoles: ['Owner'] as string[],
  },
}));

vi.mock('@/modules/auth/AuthProvider', () => ({
  useAuth: () => authStateMock,
}));
vi.mock('./requests', () => ({
  getOrganizationBySlug: vi.fn(),
  getOrganizationUsers: vi.fn(),
  getOrganizationUserProjects: vi.fn(),
}));
vi.mock('@/core/utils/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/utils/helpers')>()),
  showModuleErrorToast: vi.fn(),
}));

const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
  <QueryClientProvider client={queryClient}>
    <WorkspaceProvider>{children}</WorkspaceProvider>
  </QueryClientProvider>
);

afterEach(() => {
  queryClient.clear();
  localStorage.clear();
  vi.clearAllMocks();
  authStateMock.loggedInUser = { id: 'user-1', email: 'ada@example.com', isSuperAdmin: false };
  authStateMock.loggedInUserRoles = [OrganizationUserRole.Owner];
});

it('keeps raw users in the shared cache and models them after the members query refetches', async () => {
  saveContextOrganizationSlugInLS('acme');
  vi.mocked(requests.getOrganizationBySlug).mockResolvedValue({
    data: { id: 'org-1', name: 'Acme', slug: 'acme', archivedAt: null },
  } as Awaited<ReturnType<typeof requests.getOrganizationBySlug>>);
  vi.mocked(requests.getOrganizationUserProjects).mockResolvedValue({
    data: [
      { projectId: 'project-1', projectName: 'Project', clientId: 'client-1', clientName: 'Client', role: 'Owner' },
    ],
  } as unknown as Awaited<ReturnType<typeof requests.getOrganizationUserProjects>>);
  const rawUser = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    identities: [],
    organizationRoles: [],
    archived: false,
  };
  vi.mocked(requests.getOrganizationUsers).mockResolvedValue({ data: [rawUser] } as unknown as Awaited<
    ReturnType<typeof requests.getOrganizationUsers>
  >);

  const { result } = renderHook(() => ({ workspace: useWorkspace(), members: useOrganizationUsersQuery() }), {
    wrapper,
  });

  await waitFor(() => expect(result.current.workspace.contextOrganizationUsers[0]?.fullName).toBe('Ada Lovelace'));
  expect(result.current.workspace.contextOrganizationLoggedInUser?.projects).toHaveLength(1);
  expect(queryClient.getQueryData(organizationUsersQueryKey('acme', true))).toEqual([rawUser]);

  const fetchedUsers = await result.current.workspace.fetchContextOrganizationUsers();
  expect(fetchedUsers[0]?.fullName).toBe('Ada Lovelace');
  expect(fetchedUsers[0]?.projects).toHaveLength(1);
  expect(queryClient.getQueryData(organizationUsersQueryKey('acme', true))).toEqual([rawUser]);

  await act(async () => {
    await result.current.members.refetch();
  });

  expect(result.current.workspace.contextOrganizationUsers[0]?.fullName).toBe('Ada Lovelace');
  expect(result.current.workspace.availableUsersOptions[0]?.label).toBe('Ada Lovelace');
  expect(result.current.workspace.contextOrganizationLoggedInUser?.projects).toHaveLength(1);
  expect(queryClient.getQueryData(organizationUsersQueryKey('acme', true))).toEqual([rawUser]);
  expect(getContextOrganizationSlugFromLS()).toBe('acme');
});

it('resolves the imperative user refresh after its subscribed query has reported an error', async () => {
  saveContextOrganizationSlugInLS('acme');
  vi.mocked(requests.getOrganizationBySlug).mockResolvedValue({
    data: { id: 'org-1', name: 'Acme', slug: 'acme', archivedAt: null },
  } as Awaited<ReturnType<typeof requests.getOrganizationBySlug>>);
  vi.mocked(requests.getOrganizationUsers).mockRejectedValue(new Error('users unavailable'));

  const { result } = renderHook(() => useWorkspace(), { wrapper });
  await waitFor(() => expect(requests.getOrganizationUsers).toHaveBeenCalled());

  await act(async () => {
    await expect(result.current.fetchContextOrganizationUsers()).resolves.toEqual([]);
  });
  expect(result.current.isLoadingContextOrganizationUsers).toBe(false);
});

it('loads the logged-in employee’s project details for read-only views', async () => {
  saveContextOrganizationSlugInLS('acme');
  vi.mocked(requests.getOrganizationBySlug).mockResolvedValue({
    data: { id: 'org-1', name: 'Acme', slug: 'acme', archivedAt: null },
  } as Awaited<ReturnType<typeof requests.getOrganizationBySlug>>);
  vi.mocked(requests.getOrganizationUsers).mockResolvedValue({
    data: [
      {
        id: 'employee-1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        identities: [],
        organizationRoles: [OrganizationUserRole.Employee],
        archived: false,
      },
    ],
  } as unknown as Awaited<ReturnType<typeof requests.getOrganizationUsers>>);
  vi.mocked(requests.getOrganizationUserProjects).mockResolvedValue({
    data: [
      { projectId: 'project-1', projectName: 'Project', clientId: 'client-1', clientName: 'Client', role: 'Owner' },
    ],
  } as unknown as Awaited<ReturnType<typeof requests.getOrganizationUserProjects>>);
  authStateMock.loggedInUser = { id: 'employee-1', email: 'employee@example.com', isSuperAdmin: false };
  authStateMock.loggedInUserRoles = [OrganizationUserRole.Employee];

  const { result } = renderHook(() => useWorkspace(), { wrapper });

  await waitFor(() => expect(result.current.contextOrganizationUsers[0]?.id).toBe('employee-1'));
  expect(requests.getOrganizationUsers).toHaveBeenCalledWith('acme', true);
  expect(requests.getOrganizationUserProjects).toHaveBeenCalledWith('acme', 'employee-1');
  expect(result.current.contextOrganizationLoggedInUser?.projects).toEqual([
    expect.objectContaining({ projectId: 'project-1', role: 'Owner' }),
  ]);
  expect(result.current.isInitialLoadingContextOrganizationUsers).toBe(false);
});
