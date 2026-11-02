import { ClientType, ProjectUserRole } from '@/core/models/enums';
import { useProjectsQuery } from '@/modules/projects/hooks/useProjectsQuery';
import { projectsQueryKey } from '@/modules/projects/queryKeys';
import * as requests from '@/modules/projects/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/projects/requests', () => ({ getProjects: vi.fn() }));
const getProjectsMock = requests.getProjects as unknown as ReturnType<typeof vi.fn>;

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

// createElement instead of JSX: this file stays `.ts` (matching this repo's
// check-file/filename-naming-convention, which only exempts `use*.test.tsx` from PascalCase),
// so it can't use JSX syntax, which only parses in `.tsx`.
const wrapper = ({ children }: { children: ReactNode }): ReactElement => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('projectsQueryKey', () => {
  it('is a flat, entity-prefixed key that serializes the dto', () => {
    expect(projectsQueryKey({ organizationSlug: 'acme', includeArchived: true })).toEqual([
      'projects',
      JSON.stringify({ organizationSlug: 'acme', includeArchived: true }),
    ]);
  });
});

describe('useProjectsQuery', () => {
  it('fetches with includeArchived always true and returns parsed results', async () => {
    getProjectsMock.mockResolvedValueOnce({ data: { count: 1, results: [rawProject] } });

    const { result } = renderHook(() => useProjectsQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getProjectsMock).toHaveBeenCalledWith({ organizationSlug: 'acme', includeArchived: true });
    expect(result.current.data?.results).toEqual([rawProject]);
  });
});
