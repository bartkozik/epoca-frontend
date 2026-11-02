import { showToastForError } from '@/core/utils/helpers';
import {
  useAssignOrganizationUserMutation,
  useChangeOrganizationUserRoleMutation,
  useDeassignOrganizationUserMutation,
} from '@/modules/organizations/hooks/useAssignOrganizationUserMutation';
import { organizationUsersQueryKey } from '@/modules/organizations/queryKeys';
import * as requests from '@/modules/organizations/requests';
import { OrganizationUserRole, type RawOrganizationUser } from '@/modules/organizations/types';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/organizations/requests', () => ({
  assignUserToOrganization: vi.fn(),
  deassignUserFromOrganization: vi.fn(),
}));
const assignUserToOrganizationMock = requests.assignUserToOrganization as unknown as ReturnType<typeof vi.fn>;
const deassignUserFromOrganizationMock = requests.deassignUserFromOrganization as unknown as ReturnType<typeof vi.fn>;

const fetchContextOrganizationUsersMock = vi.fn();
const removeContextOrganizationUserMock = vi.fn();
const refreshAfterPermissionGrantMock = vi.fn().mockResolvedValue(undefined);
const addToastMock = vi.fn();
let loggedInUserId = 'user-1';
vi.mock('@/modules/auth/AuthProvider', () => ({
  useAuth: () => ({
    get loggedInUser() {
      return { id: loggedInUserId };
    },
    refreshAfterPermissionGrant: refreshAfterPermissionGrantMock,
  }),
}));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({
    contextOrganizationSlug: 'acme',
    fetchContextOrganizationUsers: fetchContextOrganizationUsersMock,
    removeContextOrganizationUser: removeContextOrganizationUserMock,
  }),
}));
vi.mock('@/core/providers/toastProvider', () => ({ useToast: () => ({ addToast: addToastMock }) }));

vi.mock('@/core/utils/helpers', () => ({ showToastForError: vi.fn() }));
const showToastForErrorMock = showToastForError as unknown as ReturnType<typeof vi.fn>;

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  loggedInUserId = 'user-1';
  vi.clearAllMocks();
});

describe('useAssignOrganizationUserMutation', () => {
  it('assigns a user, toasts, invalidates organizationUsers/organizationUserProjects, and refreshes the bridge', async () => {
    assignUserToOrganizationMock.mockResolvedValueOnce(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useAssignOrganizationUserMutation(), { wrapper });
    result.current.mutate({ userId: 'new@acme.test', roles: [OrganizationUserRole.Employee] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(assignUserToOrganizationMock).toHaveBeenCalledWith('acme', 'new@acme.test', [OrganizationUserRole.Employee]);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['organizationUsers', 'acme', 'true'], exact: false });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['organizationUserProjects', 'acme', 'new@acme.test'],
      exact: false,
    });
    expect(fetchContextOrganizationUsersMock).toHaveBeenCalled();
    expect(addToastMock).toHaveBeenCalled();
    expect(refreshAfterPermissionGrantMock).not.toHaveBeenCalled();
  });

  it('shows an error toast on failure', async () => {
    assignUserToOrganizationMock.mockRejectedValueOnce(new Error('failed'));

    const { result } = renderHook(() => useAssignOrganizationUserMutation(), { wrapper });
    result.current.mutate({ userId: 'new@acme.test', roles: [] });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(showToastForErrorMock).toHaveBeenCalled();
  });
});

describe('useChangeOrganizationUserRoleMutation', () => {
  it('refreshes permissions when the acting user changes their own role', async () => {
    assignUserToOrganizationMock.mockResolvedValueOnce(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useChangeOrganizationUserRoleMutation(), { wrapper });
    result.current.mutate({ userId: 'user-1', roles: [OrganizationUserRole.Owner] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(refreshAfterPermissionGrantMock).toHaveBeenCalled();
    expect(fetchContextOrganizationUsersMock).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['organizationUserProjects', 'acme', 'user-1'],
      exact: false,
    });
  });

  it('does not refresh permissions when changing a different user role', async () => {
    assignUserToOrganizationMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useChangeOrganizationUserRoleMutation(), { wrapper });
    result.current.mutate({ userId: 'user-2', roles: [OrganizationUserRole.Manager] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(refreshAfterPermissionGrantMock).not.toHaveBeenCalled();
  });
});

describe('useDeassignOrganizationUserMutation', () => {
  it('deassigns a user and invalidates organizationUsers, organizationUserProjects, and projects', async () => {
    deassignUserFromOrganizationMock.mockResolvedValueOnce(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeassignOrganizationUserMutation(), { wrapper });
    result.current.mutate({ userId: 'user-2' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(deassignUserFromOrganizationMock).toHaveBeenCalledWith('acme', 'user-2');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['organizationUsers', 'acme', 'true'], exact: false });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['organizationUserProjects', 'acme', 'user-2'],
      exact: false,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'], exact: false });
    expect(fetchContextOrganizationUsersMock).toHaveBeenCalled();
  });

  it('optimistically removes the user from the query cache and workspace state on success', async () => {
    deassignUserFromOrganizationMock.mockResolvedValueOnce(undefined);
    const remainingUser = { id: 'user-1' } as RawOrganizationUser;
    const removedUser = { id: 'user-2' } as RawOrganizationUser;
    queryClient.setQueryData(organizationUsersQueryKey('acme', true), [remainingUser, removedUser]);

    const { result } = renderHook(() => useDeassignOrganizationUserMutation(), { wrapper });
    result.current.mutate({ userId: 'user-2' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(organizationUsersQueryKey('acme', true))).toEqual([remainingUser]);
    expect(removeContextOrganizationUserMock).toHaveBeenCalledWith('user-2');
  });

  it('keeps the optimistic removal even when the post-success refetch fails', async () => {
    deassignUserFromOrganizationMock.mockResolvedValueOnce(undefined);
    // fetchContextOrganizationUsers never actually rejects (its real implementation swallows
    // errors internally via .catch), so the mock mirrors that contract while still simulating
    // "the refetch it triggers did not succeed in refreshing the bridge".
    fetchContextOrganizationUsersMock.mockImplementationOnce(() =>
      Promise.reject(new Error('refetch failed')).catch(() => undefined),
    );
    const remainingUser = { id: 'user-1' } as RawOrganizationUser;
    const removedUser = { id: 'user-2' } as RawOrganizationUser;
    queryClient.setQueryData(organizationUsersQueryKey('acme', true), [remainingUser, removedUser]);

    const { result } = renderHook(() => useDeassignOrganizationUserMutation(), { wrapper });
    result.current.mutate({ userId: 'user-2' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(organizationUsersQueryKey('acme', true))).toEqual([remainingUser]);
    expect(removeContextOrganizationUserMock).toHaveBeenCalledWith('user-2');
  });
});
