import { queryClient } from '@/core/api';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactElement, type ReactNode } from 'react';
import type { MockedFunction } from 'vitest';
import { useClients } from './ClientsContext';
import { ClientsProvider } from './ClientsProviderComponent';
import * as requests from './requests';

const { showModuleErrorToastMock } = vi.hoisted(() => ({ showModuleErrorToastMock: vi.fn() }));

vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));
vi.mock('@/core/utils/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/utils/helpers')>()),
  showModuleErrorToast: showModuleErrorToastMock,
}));
vi.mock('i18next', () => ({ __esModule: true, default: { t: (key: string) => key } }));
vi.mock('./requests', () => ({ getClients: vi.fn(), getClientProjects: vi.fn() }));

const getClientsMock = requests.getClients as MockedFunction<typeof requests.getClients>;
const getClientProjectsMock = requests.getClientProjects as MockedFunction<typeof requests.getClientProjects>;
const rawProject = (id: string, name: string): { id: string; name: string; [key: string]: unknown } => ({
  archivedAt: '',
  client: { color: '#000', id: 'client-1', name: 'Acme', texture: '', type: 'External' },
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'user-1',
  description: '',
  id,
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: 'user-1',
  name,
  organizationId: 'org-1',
  projectUsers: [],
  userCount: 0,
  userIds: [],
});
const client = (id: string, projects: Array<{ id: string }> = []): never => ({ id, projects }) as never;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};

const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(ClientsProvider, null, children),
  );

beforeEach(() => {
  queryClient.clear();
  queryClient.setQueryDefaults(['clients'], { retry: false });
  queryClient.setQueryDefaults(['clientProjects'], { retry: false });
  vi.clearAllMocks();
  getClientsMock.mockResolvedValue({ data: { count: 0, results: [] } } as never);
});

afterEach(() => queryClient.clear());

it('models and sorts fetched client projects and tracks the in-flight loading state', async () => {
  const projectsResponse = deferred<{ data: { count: number; results: ReturnType<typeof rawProject>[] } }>();
  getClientProjectsMock.mockReturnValue(projectsResponse.promise as never);
  const { result } = renderHook(useClients, { wrapper });
  await waitFor(() => expect(result.current.isLoadingClients).toBe(false));
  act(() => result.current.setClient(client('client-1')));

  let pending!: Promise<void>;
  act(() => {
    pending = result.current.fetchClientProjects('client-1');
  });
  await waitFor(() => expect(result.current.isLoadingClientDetails).toBe(true));
  projectsResponse.resolve({ data: { count: 2, results: [rawProject('project-2', 'Website'), rawProject('project-1', 'Alpha')] } });
  await act(async () => pending);

  expect(result.current.client?.projects.map(({ name }) => name)).toEqual(['Alpha', 'Website']);
  expect(result.current.isLoadingClientDetails).toBe(false);
});

it('does not write a stale project response onto a different selected client', async () => {
  const projectsResponse = deferred<{ data: { count: number; results: ReturnType<typeof rawProject>[] } }>();
  getClientProjectsMock.mockReturnValue(projectsResponse.promise as never);
  const { result } = renderHook(useClients, { wrapper });
  await waitFor(() => expect(result.current.isLoadingClients).toBe(false));
  act(() => result.current.setClient(client('client-1')));

  let pending!: Promise<void>;
  act(() => {
    pending = result.current.fetchClientProjects('client-1');
  });
  act(() => result.current.setClient(client('client-2', [{ id: 'existing-project' }])));
  projectsResponse.resolve({ data: { count: 1, results: [rawProject('stale-project', 'Stale')] } });
  await act(async () => pending);

  expect(result.current.client).toMatchObject({ id: 'client-2', projects: [{ id: 'existing-project' }] });
});

it('preserves mirrored projects only while refreshing the same selected client', async () => {
  const { result } = renderHook(useClients, { wrapper });
  await waitFor(() => expect(result.current.isLoadingClients).toBe(false));
  const projects = [{ id: 'project-1', name: 'Existing project' }];
  act(() => result.current.setClient(client('client-1', projects)));

  act(() => result.current.setClient(client('client-1')));
  expect(result.current.client).toMatchObject({ id: 'client-1', projects });

  act(() => result.current.setClient(client('client-2')));
  expect(result.current.client).toMatchObject({ id: 'client-2', projects: [] });
});

it('shows an error toast and resolves after client project reads fail', async () => {
  getClientProjectsMock.mockRejectedValueOnce(new Error('invalid response shape'));
  const { result } = renderHook(useClients, { wrapper });
  await waitFor(() => expect(result.current.isLoadingClients).toBe(false));

  await act(async () => {
    await expect(result.current.fetchClientProjects('client-1')).resolves.toBeUndefined();
  });

  expect(showModuleErrorToastMock).toHaveBeenCalledWith(expect.any(Error), {
    default: 'toast_message.projects.data_fetch_error',
  });
  expect(result.current.isLoadingClientDetails).toBe(false);
});

it('shows an error toast and returns an empty list after a client refresh fails', async () => {
  const { result } = renderHook(useClients, { wrapper });
  await waitFor(() => expect(result.current.isLoadingClients).toBe(false));
  getClientsMock.mockRejectedValueOnce(new Error('service unavailable'));

  await act(async () => {
    await expect(result.current.fetchClients()).resolves.toEqual([]);
  });

  expect(showModuleErrorToastMock).toHaveBeenCalledWith(expect.any(Error), {
    default: 'toast_message.clients.data_fetch_error',
  });
});
