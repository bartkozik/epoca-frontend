import { ClientType, ProjectUserRole } from '@/core/models/enums';
import { useProjectQuery } from '@/modules/projects/hooks/useProjectQuery';
import { projectQueryKey } from '@/modules/projects/queryKeys';
import * as requests from '@/modules/projects/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/projects/requests', () => ({ getProject: vi.fn() }));
const getProjectMock = requests.getProject as unknown as ReturnType<typeof vi.fn>;

vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));

const rawProject = {
  archivedAt: '',
  client: {
    color: '#000000',
    id: 'client-1',
    name: 'Acme',
    texture: 'texture-1',
    type: ClientType.External,
  },
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'user-1',
  description: 'A project',
  id: 'project-1',
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: 'user-1',
  name: 'Website Redesign',
  organizationId: 'org-1',
  projectUsers: [
    {
      avatar: '',
      firstName: 'Jane',
      id: 'user-1',
      lastName: 'Doe',
      role: ProjectUserRole.Owner,
    },
  ],
  userCount: 1,
  userIds: ['user-1'],
};

const wrapper = ({ children }: { children: ReactNode }): ReactElement => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('projectQueryKey', () => {
  it('is a flat key of the entity prefix, the organization slug, and the project id', () => {
    expect(projectQueryKey('acme', 'project-1')).toEqual(['project', 'acme', 'project-1']);
  });
});

describe('useProjectQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches by organizationSlug/projectId and returns the raw parsed project directly', async () => {
    getProjectMock.mockResolvedValueOnce({ data: rawProject });

    const { result } = renderHook(() => useProjectQuery('project-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getProjectMock).toHaveBeenCalledWith('acme', 'project-1');
    expect(result.current.data).toEqual(rawProject);
  });

  it('is disabled (does not fetch) when projectId is undefined', () => {
    const { result } = renderHook(() => useProjectQuery(undefined), { wrapper });

    expect(getProjectMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});
