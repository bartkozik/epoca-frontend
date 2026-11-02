import { ClientType } from '@/modules/clients/types';
import { useCreateProjectMutation } from '@/modules/projects/hooks/useCreateProjectMutation';
import * as requests from '@/modules/projects/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/projects/requests', () => ({ addNewProject: vi.fn() }));
const addNewProjectMock = requests.addNewProject as unknown as ReturnType<typeof vi.fn>;

const { fetchClientProjectsMock, invalidateClientProjectsMock, clientsState } = vi.hoisted(() => ({
  fetchClientProjectsMock: vi.fn(),
  invalidateClientProjectsMock: vi.fn(),
  clientsState: { client: null as { id: string } | null },
}));
vi.mock('@/modules/clients/clientCache', () => ({ invalidateClientProjects: invalidateClientProjectsMock }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));
vi.mock('@/modules/clients/ClientsProvider', () => ({
  useClients: () => ({ client: clientsState.client, fetchClientProjects: fetchClientProjectsMock }),
}));

const rawProject = {
  archivedAt: '',
  client: { color: '#000', id: 'client-1', name: 'Acme', texture: 'texture-1', type: ClientType.External },
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'user-1',
  description: '',
  id: 'project-1',
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: 'user-1',
  name: 'Website',
  organizationId: 'org-1',
  projectUsers: [],
  userCount: 0,
  userIds: [],
};

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clientsState.client = null;
  vi.clearAllMocks();
});

describe('useCreateProjectMutation', () => {
  it('creates a project and invalidates the projects and client-project caches', async () => {
    addNewProjectMock.mockResolvedValueOnce({ data: rawProject });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateProjectMutation(), { wrapper });
    result.current.mutate({
      name: 'Website',
      clientId: 'client-1',
      description: '',
      memberIds: [],
      ownerIds: [],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(addNewProjectMock).toHaveBeenCalledWith({
      organizationSlug: 'acme',
      name: 'Website',
      clientId: 'client-1',
      description: '',
      memberIds: [],
      ownerIds: [],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'], exact: false });
    expect(invalidateClientProjectsMock).toHaveBeenCalledWith('acme', 'client-1');
    expect(fetchClientProjectsMock).not.toHaveBeenCalled();
  });

  it('refetches the singular client.projects when the currently-loaded client matches', async () => {
    clientsState.client = { id: 'client-1' };
    addNewProjectMock.mockResolvedValueOnce({ data: rawProject });

    const { result } = renderHook(() => useCreateProjectMutation(), { wrapper });
    result.current.mutate({
      name: 'Website',
      clientId: 'client-1',
      description: '',
      memberIds: [],
      ownerIds: [],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchClientProjectsMock).toHaveBeenCalledWith('client-1');
  });

  it('does not refetch client.projects when the loaded client is a different one', async () => {
    clientsState.client = { id: 'client-2' };
    addNewProjectMock.mockResolvedValueOnce({ data: rawProject });

    const { result } = renderHook(() => useCreateProjectMutation(), { wrapper });
    result.current.mutate({
      name: 'Website',
      clientId: 'client-1',
      description: '',
      memberIds: [],
      ownerIds: [],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchClientProjectsMock).not.toHaveBeenCalled();
  });
});
