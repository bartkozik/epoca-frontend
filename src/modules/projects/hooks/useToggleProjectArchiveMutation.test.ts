import { useToggleProjectArchiveMutation } from '@/modules/projects/hooks/useToggleProjectArchiveMutation';
import * as requests from '@/modules/projects/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/projects/requests', () => ({ archiveProject: vi.fn(), unarchiveProject: vi.fn() }));
const archiveProjectMock = requests.archiveProject as unknown as ReturnType<typeof vi.fn>;
const unarchiveProjectMock = requests.unarchiveProject as unknown as ReturnType<typeof vi.fn>;

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

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clientsState.client = null;
  vi.clearAllMocks();
});

describe('useToggleProjectArchiveMutation', () => {
  it('archives when not currently archived and invalidates the affected caches', async () => {
    archiveProjectMock.mockResolvedValueOnce(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useToggleProjectArchiveMutation(), { wrapper });
    result.current.mutate({ projectId: 'project-1', isCurrentlyArchived: false, clientId: 'client-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(archiveProjectMock).toHaveBeenCalledWith('acme', 'project-1');
    expect(unarchiveProjectMock).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'], exact: false });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project', 'acme', 'project-1'], exact: false });
    expect(invalidateClientProjectsMock).toHaveBeenCalledWith('acme', 'client-1');
  });

  it('unarchives when currently archived', async () => {
    unarchiveProjectMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useToggleProjectArchiveMutation(), { wrapper });
    result.current.mutate({ projectId: 'project-1', isCurrentlyArchived: true, clientId: 'client-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(unarchiveProjectMock).toHaveBeenCalledWith('acme', 'project-1');
    expect(archiveProjectMock).not.toHaveBeenCalled();
  });

  it('refetches the active client when it matches the archived project’s client', async () => {
    clientsState.client = { id: 'client-1' };
    archiveProjectMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useToggleProjectArchiveMutation(), { wrapper });
    result.current.mutate({ projectId: 'project-1', isCurrentlyArchived: false, clientId: 'client-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchClientProjectsMock).toHaveBeenCalledWith('client-1');
  });

  it('does not refetch the active client when it is a different client', async () => {
    clientsState.client = { id: 'client-2' };
    archiveProjectMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useToggleProjectArchiveMutation(), { wrapper });
    result.current.mutate({ projectId: 'project-1', isCurrentlyArchived: false, clientId: 'client-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchClientProjectsMock).not.toHaveBeenCalled();
  });

  it('invalidates clientProjectsQueryKey on unarchive too', async () => {
    clientsState.client = { id: 'client-1' };
    unarchiveProjectMock.mockResolvedValueOnce(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useToggleProjectArchiveMutation(), { wrapper });
    result.current.mutate({ projectId: 'project-1', isCurrentlyArchived: true, clientId: 'client-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['clientProjects', 'acme', 'client-1'],
      exact: false,
    });
    expect(fetchClientProjectsMock).toHaveBeenCalledWith('client-1');
  });
});
