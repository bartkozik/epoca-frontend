import { OrganizationUserRole } from '@/modules/organizations/types';
import { ProjectsProvider } from '@/modules/projects/ProjectsProvider';
import * as projectsRequests from '@/modules/projects/requests';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import Integrations from './Integrations';

const providers = vi.hoisted(() => ({
  auth: { loggedInUser: { id: 'user-1' }, loggedInUserRoles: ['Owner'] },
  workspace: {
    contextOrganizationSlug: 'acme',
    contextOrganizationUsers: [],
    fetchContextOrganizationUsers: vi.fn().mockResolvedValue([]),
  },
  clients: { selectedFilterTypeMemberProject: 'All', setSelectedClient: vi.fn() },
}));

vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => providers.auth }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({ useWorkspace: () => providers.workspace }));
vi.mock('@/modules/clients/ClientsProvider', () => ({ useClients: () => providers.clients }));
vi.mock('@/modules/projects/requests', () => ({ getProjects: vi.fn() }));
vi.mock('@/modules/integrationClients/requests', () => ({
  listIntegrationClients: vi.fn().mockResolvedValue({ count: 0, results: [] }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-GB' } }),
}));

describe('Integrations project catalog requests', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('does not restart failed catalog queries when their error state rerenders the provider', async () => {
    vi.useFakeTimers();
    providers.auth.loggedInUserRoles = [OrganizationUserRole.Owner];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let rejectProjects!: (reason: Error) => void;
    const failedRequest = new Promise<Awaited<ReturnType<typeof projectsRequests.getProjects>>>((_, reject) => {
      rejectProjects = reject;
    });
    vi.mocked(projectsRequests.getProjects)
      .mockReturnValue(new Promise(() => undefined))
      .mockReturnValueOnce(failedRequest)
      .mockReturnValueOnce(failedRequest);

    const view = render(
      <QueryClientProvider client={queryClient}>
        <ProjectsProvider>
          <Integrations />
        </ProjectsProvider>
      </QueryClientProvider>,
    );

    try {
      expect(projectsRequests.getProjects).toHaveBeenCalledTimes(2);
      await act(async () => {
        rejectProjects(new Error('503 unavailable'));
        await vi.advanceTimersByTimeAsync(1);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(projectsRequests.getProjects).toHaveBeenCalledTimes(2);
      expect(
        queryClient
          .getQueryCache()
          .findAll({ queryKey: ['projects'] })
          .map((query) => query.state.status),
      ).toEqual(['error', 'error']);
    } finally {
      view.unmount();
      queryClient.clear();
    }
  });
});
