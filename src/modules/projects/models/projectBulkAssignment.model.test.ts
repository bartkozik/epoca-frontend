import { ClientFilterType } from '@/core/models/enums';
import { organizationUserProjectsQueryKey } from '@/modules/organizations/queryKeys';
import {
  useToggleAllProjectsAssignmentMutation,
  useToggleProjectAssignmentMutation,
} from '@/modules/projects/hooks/useToggleAllProjectsAssignmentMutation';
import * as requests from '@/modules/projects/requests';
import { Project } from '@/modules/projects/types';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/projects/requests', () => ({
  assignUserToAllProjects: vi.fn(),
  unassignUserFromAllProjects: vi.fn(),
  addUser: vi.fn(),
  removeUser: vi.fn(),
}));
const assignAllMock = requests.assignUserToAllProjects as unknown as ReturnType<typeof vi.fn>;
const unassignAllMock = requests.unassignUserFromAllProjects as unknown as ReturnType<typeof vi.fn>;
const addUserMock = requests.addUser as unknown as ReturnType<typeof vi.fn>;
const removeUserMock = requests.removeUser as unknown as ReturnType<typeof vi.fn>;

const project1 = { id: 'project-1', name: 'Website', client: { id: 'client-1', name: 'Acme' } } as unknown as Project;
const project2 = { id: 'project-2', name: 'App', client: { id: 'client-2', name: 'Globex' } } as unknown as Project;

let selectedProjectUser: { id: string; projects: { projectId: string }[] } | null = null;
let selectedFilterTypeMemberProject = ClientFilterType.All;

vi.mock('@/modules/clients/ClientsProvider', () => ({
  useClients: () => ({
    get selectedFilterTypeMemberProject() {
      return selectedFilterTypeMemberProject;
    },
  }),
}));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));
vi.mock('@/modules/projects/ProjectsProvider', () => ({
  useProjects: () => ({
    setSelectedProjectUser: (user: typeof selectedProjectUser) => {
      selectedProjectUser = user;
    },
    get selectedProjectUser() {
      return selectedProjectUser;
    },
    get filteredOrganizationProjects() {
      return [project1, project2];
    },
  }),
}));

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  selectedProjectUser = { id: 'user-1', projects: [] };
  selectedFilterTypeMemberProject = ClientFilterType.All;
  vi.clearAllMocks();
});

describe('useToggleAllProjectsAssignmentMutation', () => {
  it('assigns to all projects, adds the changed ones to selectedProjectUser.projects, and invalidates the projects caches', async () => {
    assignAllMock.mockResolvedValueOnce({ data: { changedProjectIds: ['project-1', 'project-2'] } });
    const userProjectsKey = organizationUserProjectsQueryKey('acme', 'user-1');
    queryClient.setQueryData(userProjectsKey, []);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useToggleAllProjectsAssignmentMutation(), { wrapper });
    result.current.mutate({ isAssigned: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(assignAllMock).toHaveBeenCalledWith({ organizationSlug: 'acme', userId: 'user-1', clientType: undefined });
    expect(selectedProjectUser?.projects.map((p) => p.projectId)).toEqual(['project-1', 'project-2']);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project'] });
    expect(queryClient.getQueryState(userProjectsKey)?.isInvalidated).toBe(true);
  });

  it('unassigns from all projects and removes the changed ones from selectedProjectUser.projects', async () => {
    selectedProjectUser = { id: 'user-1', projects: [{ projectId: 'project-1' }, { projectId: 'project-2' }] };
    const userProjectsKey = organizationUserProjectsQueryKey('acme', 'user-1');
    queryClient.setQueryData(userProjectsKey, selectedProjectUser.projects);
    unassignAllMock.mockResolvedValueOnce({ data: { changedProjectIds: ['project-1', 'project-2'] } });

    const { result } = renderHook(() => useToggleAllProjectsAssignmentMutation(), { wrapper });
    result.current.mutate({ isAssigned: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(unassignAllMock).toHaveBeenCalledWith({ organizationSlug: 'acme', userId: 'user-1', clientType: undefined });
    expect(selectedProjectUser?.projects).toEqual([]);
    expect(queryClient.getQueryState(userProjectsKey)?.isInvalidated).toBe(true);
  });

  it('passes the selected client type filter through as clientType, unless it is All', async () => {
    selectedFilterTypeMemberProject = ClientFilterType.External;
    assignAllMock.mockResolvedValueOnce({ data: { changedProjectIds: [] } });

    const { result } = renderHook(() => useToggleAllProjectsAssignmentMutation(), { wrapper });
    result.current.mutate({ isAssigned: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(assignAllMock).toHaveBeenCalledWith({
      organizationSlug: 'acme',
      userId: 'user-1',
      clientType: ClientFilterType.External,
    });
  });

  it('rejects when no user is selected', async () => {
    selectedProjectUser = null;

    const { result } = renderHook(() => useToggleAllProjectsAssignmentMutation(), { wrapper });
    result.current.mutate({ isAssigned: false });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(assignAllMock).not.toHaveBeenCalled();
  });
});

describe('useToggleProjectAssignmentMutation', () => {
  it('assigns a project, adds it to selectedProjectUser.projects, and invalidates the projects caches', async () => {
    addUserMock.mockResolvedValueOnce(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useToggleProjectAssignmentMutation(), { wrapper });
    result.current.mutate({ project: project1, isAssigned: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(addUserMock).toHaveBeenCalledWith('acme', 'user-1', 'project-1', 'Member');
    expect(selectedProjectUser?.projects).toEqual([
      { clientId: 'client-1', clientName: 'Acme', projectId: 'project-1', projectName: 'Website' },
    ]);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project', 'acme', 'project-1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: organizationUserProjectsQueryKey('acme', 'user-1') });
  });

  it('unassigns a project and removes it from selectedProjectUser.projects', async () => {
    selectedProjectUser = { id: 'user-1', projects: [{ projectId: 'project-1' }] };
    const userProjectsKey = organizationUserProjectsQueryKey('acme', 'user-1');
    queryClient.setQueryData(userProjectsKey, selectedProjectUser.projects);
    removeUserMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useToggleProjectAssignmentMutation(), { wrapper });
    result.current.mutate({ project: project1, isAssigned: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(removeUserMock).toHaveBeenCalledWith('acme', 'user-1', 'project-1');
    expect(selectedProjectUser?.projects).toEqual([]);
    expect(queryClient.getQueryState(userProjectsKey)?.isInvalidated).toBe(true);
  });

  it('rejects when no user is selected', async () => {
    selectedProjectUser = null;

    const { result } = renderHook(() => useToggleProjectAssignmentMutation(), { wrapper });
    result.current.mutate({ project: project1, isAssigned: false });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(addUserMock).not.toHaveBeenCalled();
  });
});
