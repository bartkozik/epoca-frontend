import { organizationUserProjectsQueryKey } from '@/modules/organizations/queryKeys';
import {
  useAssignUserMutation,
  useUnassignUserMutation,
  useUpdateUserRoleMutation,
} from '@/modules/projects/hooks/useAssignUserMutation';
import * as requests from '@/modules/projects/requests';
import type { Project } from '@/modules/projects/types';
import { ProjectUserRole } from '@/modules/projects/types';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/projects/requests', () => ({ addUser: vi.fn(), removeUser: vi.fn() }));
const addUserMock = requests.addUser as unknown as ReturnType<typeof vi.fn>;
const removeUserMock = requests.removeUser as unknown as ReturnType<typeof vi.fn>;

let selectedProjectUsers = [
  { id: 'user-1', role: ProjectUserRole.Member },
  { id: 'user-2', role: ProjectUserRole.Owner },
];

vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));
vi.mock('@/modules/projects/ProjectsProvider', () => ({
  useProjects: () => ({
    get selectedProject() {
      return { id: 'project-1', projectUsers: selectedProjectUsers, createdAt: '', archivedAt: '' };
    },
    setSelectedProject: (project: Project) => {
      selectedProjectUsers = project.projectUsers;
    },
    get selectedProjectUsers() {
      return selectedProjectUsers;
    },
  }),
}));

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  selectedProjectUsers[0].role = ProjectUserRole.Member;
  vi.clearAllMocks();
});

describe('useAssignUserMutation', () => {
  it('assigns a user and invalidates the project cache', async () => {
    addUserMock.mockResolvedValueOnce(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useAssignUserMutation(), { wrapper });
    result.current.mutate({ userId: 'user-1', projectId: 'project-1', role: ProjectUserRole.Member });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(addUserMock).toHaveBeenCalledWith('acme', 'user-1', 'project-1', ProjectUserRole.Member);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project', 'acme', 'project-1'], exact: false });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: organizationUserProjectsQueryKey('acme', 'user-1') });
  });
});

describe('useUnassignUserMutation', () => {
  it('removes a user and invalidates the project cache', async () => {
    removeUserMock.mockResolvedValueOnce(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUnassignUserMutation(), { wrapper });
    result.current.mutate({ userId: 'user-1', projectId: 'project-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(removeUserMock).toHaveBeenCalledWith('acme', 'user-1', 'project-1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project', 'acme', 'project-1'], exact: false });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: organizationUserProjectsQueryKey('acme', 'user-1') });
  });
});

describe('useUpdateUserRoleMutation', () => {
  it('updates the selected project immutably and invalidates its query', async () => {
    addUserMock.mockResolvedValueOnce(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateUserRoleMutation(), { wrapper });
    result.current.mutate({ userId: 'user-1', projectId: 'project-1', role: ProjectUserRole.Owner });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(addUserMock).toHaveBeenCalledWith('acme', 'user-1', 'project-1', ProjectUserRole.Owner);
    expect(selectedProjectUsers[0].role).toBe(ProjectUserRole.Owner);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project', 'acme', 'project-1'], exact: false });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: organizationUserProjectsQueryKey('acme', 'user-1') });
  });

  it('does nothing when the user is no longer in selectedProjectUsers', async () => {
    addUserMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useUpdateUserRoleMutation(), { wrapper });
    result.current.mutate({ userId: 'user-404', projectId: 'project-1', role: ProjectUserRole.Owner });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(selectedProjectUsers[0].role).toBe(ProjectUserRole.Member);
    expect(selectedProjectUsers[1].role).toBe(ProjectUserRole.Owner);
  });
});
