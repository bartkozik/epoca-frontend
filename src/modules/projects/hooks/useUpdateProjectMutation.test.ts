import { useUpdateProjectMutation } from '@/modules/projects/hooks/useUpdateProjectMutation';
import * as requests from '@/modules/projects/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/projects/requests', () => ({ editProject: vi.fn() }));
const editProjectMock = requests.editProject as unknown as ReturnType<typeof vi.fn>;

const { fetchClientProjectsMock, clientsState } = vi.hoisted(() => ({
  fetchClientProjectsMock: vi.fn(),
  clientsState: { client: null as { id: string } | null },
}));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));
vi.mock('@/modules/clients/ClientsProvider', () => ({
  useClients: () => ({ client: clientsState.client, fetchClientProjects: fetchClientProjectsMock }),
}));

const rawProject = {
  archivedAt: '',
  archivedBy: '',
  clientId: 'client-1',
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'user-1',
  description: 'Updated',
  id: 'project-1',
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: 'user-1',
  name: 'Website Renamed',
  organizationId: 'org-1',
};

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clientsState.client = null;
  vi.clearAllMocks();
});

describe('useUpdateProjectMutation', () => {
  it('edits a project and invalidates the list and single-project caches', async () => {
    editProjectMock.mockResolvedValueOnce({ data: rawProject });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateProjectMutation(), { wrapper });
    result.current.mutate({
      projectId: 'project-1',
      name: 'Website Renamed',
      description: 'Updated',
      memberIds: ['user-1'],
      ownerIds: ['user-2'],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(editProjectMock).toHaveBeenCalledWith({
      organizationSlug: 'acme',
      projectId: 'project-1',
      name: 'Website Renamed',
      description: 'Updated',
      memberIds: ['user-1'],
      ownerIds: ['user-2'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'], exact: false });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project', 'acme', 'project-1'], exact: false });
  });

  it('refetches the singular client.projects when the edited project belongs to the loaded client', async () => {
    clientsState.client = { id: 'client-1' };
    editProjectMock.mockResolvedValueOnce({ data: rawProject });

    const { result } = renderHook(() => useUpdateProjectMutation(), { wrapper });
    result.current.mutate({
      projectId: 'project-1',
      name: 'Website Renamed',
      description: 'Updated',
      memberIds: [],
      ownerIds: [],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchClientProjectsMock).toHaveBeenCalledWith('client-1');
  });

  it('does not refetch client.projects when the loaded client is a different one', async () => {
    clientsState.client = { id: 'client-2' };
    editProjectMock.mockResolvedValueOnce({ data: rawProject });

    const { result } = renderHook(() => useUpdateProjectMutation(), { wrapper });
    result.current.mutate({
      projectId: 'project-1',
      name: 'Website Renamed',
      description: 'Updated',
      memberIds: [],
      ownerIds: [],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchClientProjectsMock).not.toHaveBeenCalled();
  });
});
