import { paths } from '@/app/routing/paths';
import Router from '@/app/routing/Router';
import { listIntegrationClients } from '@/modules/integrationClients/requests';
import { OrganizationUserRole } from '@/modules/organizations/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock, MockedFunction, MockInstance } from 'vitest';
import { teamSettingsPaths } from './routes';

const providerMocks = vi.hoisted(() => ({ auth: vi.fn(), projects: vi.fn(), workspace: vi.fn() }));
vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: providerMocks.auth }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({ useWorkspace: providerMocks.workspace }));
vi.mock('@/modules/projects/ProjectsProvider', () => ({ useProjects: providerMocks.projects }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en', resolvedLanguage: 'en' },
    t: (key: string) => key,
  }),
}));
vi.mock('@/modules/integrationClients/requests', () => ({ listIntegrationClients: vi.fn() }));
vi.mock('@/app/routing/errorBoundary', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/app/routing/nonAuthedPageLayout', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/auth/login/Login', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/auth/passwordNew/PasswordNew', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/auth/passwordReset/PasswordReset', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/auth/signup/Signup', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/clients/Clients', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/clients/clientDetails/ClientDetails', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/organizations/workspaceSelect/WorkspaceSelect', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/projects/Projects', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/projects/projectDetails/ProjectDetails', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/reports/pivotTable/PivotTable', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/reports/report/Report', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/ssoAuth/ssoLoginCallback/SsoLoginCallback', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/teamSettings/members/memberProjectsTable/MemberProjectsTable', () => ({
  __esModule: true,
  default: () => null,
}));
vi.mock('@/modules/workingTime/WorkingTime', () => ({ __esModule: true, default: () => <div>working-time</div> }));
vi.mock('@/app/routing/ScrollToTop', () => ({ __esModule: true, default: () => null }));
vi.mock('@/app/navbar', () => ({ __esModule: true, default: () => null }));
vi.mock('@/core/theme/scrolledContainer', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/core/theme/mainContent', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/core/theme/loadingArea', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/core/theme/pageLayout', () => ({
  __esModule: true,
  default: ({ children, sectionName }: { children: React.ReactNode; sectionName: string }) => (
    <main>
      <h1>{sectionName}</h1>
      {children}
    </main>
  ),
}));
vi.mock('@/core/utils/hooks', () => ({ useTitle: vi.fn() }));
vi.mock('./members', () => ({ __esModule: true, default: () => <div>members-view</div> }));
vi.mock('./authentication', () => ({ __esModule: true, default: () => <div>authentication-view</div> }));

const listIntegrationClientsMock = listIntegrationClients as MockedFunction<typeof listIntegrationClients>;
const redirectPaths = (replaceStateSpy: MockInstance<typeof window.history.replaceState>): (string | URL)[] =>
  replaceStateSpy.mock.calls.map(([, , url]) => url).filter((url): url is string | URL => Boolean(url));

const renderSettings = ({
  path,
  role = OrganizationUserRole.Owner,
  isSuperAdmin = false,
}: {
  path: string;
  role?: OrganizationUserRole;
  isSuperAdmin?: boolean;
}): ReturnType<typeof render> & {
  auth: { hasAccess: Mock<(roles: OrganizationUserRole[]) => boolean> };
  projectsContext: { fetchProjects: Mock<() => Promise<void>>; filteredOrganizationProjects: [] };
} => {
  const auth = {
    hasAccess: vi.fn((roles: OrganizationUserRole[]) => isSuperAdmin || roles.includes(role)),
    hasAccessInOrganization: vi.fn(
      (_organizationId: string, roles: OrganizationUserRole[]) => isSuperAdmin || roles.includes(role),
    ),
    isAuthenticated: true,
    loggedInUser: { id: 'user-1', isSuperAdmin },
  };
  const projectsContext = {
    fetchProjects: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    filteredOrganizationProjects: [] as [],
  };
  providerMocks.auth.mockReturnValue(auth);
  providerMocks.workspace.mockReturnValue({
    contextOrganizationId: 'org-1',
    contextOrganizationLoadFailure: null,
    contextOrganizationSlug: 'acme',
    isContextOrganizationSlugInLocalStorage: true,
  });
  providerMocks.projects.mockReturnValue(projectsContext);
  window.history.pushState({}, '', path);

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <Router />
    </QueryClientProvider>,
  );

  return { ...view, auth, projectsContext };
};

describe('TeamSettings integration tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    listIntegrationClientsMock.mockResolvedValue({ count: 0, results: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows members, authentication and integrations tabs in route order', async () => {
    renderSettings({ path: '/team-settings/members/list' });

    const tabs = await screen.findAllByRole('tab', {}, { timeout: 3000 });
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'team_seatings.tab.members',
      'team_seatings.tab.authentication',
      'team_seatings.tab.integrations',
    ]);
  });

  it('navigates each tab to its existing path contract', async () => {
    const user = userEvent.setup();
    renderSettings({ path: '/team-settings/members/list' });

    await user.click(await screen.findByRole('tab', { name: 'team_seatings.tab.authentication' }));
    expect(window.location.pathname).toBe(teamSettingsPaths.teamSettings('authentication'));

    await user.click(screen.getByRole('tab', { name: 'team_seatings.tab.integrations' }));
    expect(window.location.pathname).toBe(teamSettingsPaths.teamSettings('integrations'));

    await user.click(screen.getByRole('tab', { name: 'team_seatings.tab.members' }));
    expect(window.location.pathname).toBe(teamSettingsPaths.teamSettings('members', 'list'));
  });

  it('renders integrations by fetching the client list through the TanStack Query hook', async () => {
    const { projectsContext } = renderSettings({ path: '/team-settings/integrations' });

    expect(await screen.findByRole('heading', { name: 'team_seatings.integrations.heading' })).toBeInTheDocument();
    expect(screen.getByText('team_seatings.integrations.description')).toBeInTheDocument();
    await waitFor(() =>
      expect(listIntegrationClientsMock).toHaveBeenCalledWith('acme', { pageSize: 20, pageNumber: 1 }),
    );
    await waitFor(() => expect(projectsContext.fetchProjects).toHaveBeenCalledTimes(1));
  });

  it('redirects the real root route to members with replace', async () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
    renderSettings({ path: '/team-settings' });

    expect(await screen.findByText('members-view')).toBeInTheDocument();
    expect(window.location.pathname).toBe(teamSettingsPaths.teamSettings('members', 'list'));
    expect(replaceStateSpy).toHaveBeenCalledWith(
      expect.anything(),
      '',
      teamSettingsPaths.teamSettings('members', 'list'),
    );
  });

  it('redirects an unknown tab safely to members', async () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
    renderSettings({ path: '/team-settings/unknown' });

    await waitFor(() => {
      expect(window.location.pathname).toBe(teamSettingsPaths.teamSettings('members', 'list'));
    });
    expect(screen.getByText('members-view')).toBeInTheDocument();
    expect(redirectPaths(replaceStateSpy)).toEqual([teamSettingsPaths.teamSettings('members', 'list')]);
  });

  it.each([
    ['/team-settings/members', teamSettingsPaths.teamSettings('members', 'list'), 'members-view'],
    ['/team-settings/members/typo', teamSettingsPaths.teamSettings('members', 'list'), 'members-view'],
    [
      '/team-settings/integrations/list',
      teamSettingsPaths.teamSettings('integrations'),
      'team_seatings.integrations.heading',
    ],
    ['/team-settings/authentication/list', teamSettingsPaths.teamSettings('authentication'), 'authentication-view'],
  ])('canonicalizes %s once to %s', async (path, canonicalPath, expectedContent) => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
    renderSettings({ path });

    expect(await screen.findByText(expectedContent)).toBeInTheDocument();
    expect(window.location.pathname).toBe(canonicalPath);
    expect(redirectPaths(replaceStateSpy)).toEqual([canonicalPath]);
    expect(replaceStateSpy).toHaveBeenCalledWith(expect.anything(), '', canonicalPath);
  });

  it.each(['list', 'invitations'])(
    'keeps the canonical members/%s route stable without a redirect loop',
    async (memberTab) => {
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
      renderSettings({ path: teamSettingsPaths.teamSettings('members', memberTab) });

      expect(await screen.findByText('members-view')).toBeInTheDocument();
      expect(window.location.pathname).toBe(teamSettingsPaths.teamSettings('members', memberTab));
      expect(redirectPaths(replaceStateSpy)).toEqual([]);
    },
  );

  it.each([
    ['owner', OrganizationUserRole.Owner, false],
    ['superadmin', OrganizationUserRole.Employee, true],
  ])('allows %s access to integrations', async (_label, role, isSuperAdmin) => {
    const { auth, projectsContext } = renderSettings({ path: '/team-settings/integrations', role, isSuperAdmin });

    expect(await screen.findByRole('heading', { name: 'team_seatings.integrations.heading' })).toBeInTheDocument();
    expect(auth.hasAccess([OrganizationUserRole.Owner])).toBe(true);
    await waitFor(() => expect(projectsContext.fetchProjects).toHaveBeenCalledTimes(1));
  });

  it.each([OrganizationUserRole.Manager, OrganizationUserRole.Employee])(
    'rejects %s before rendering or loading integrations',
    async (role) => {
      renderSettings({ path: '/team-settings/integrations', role });

      expect(await screen.findByText('working-time')).toBeInTheDocument();
      expect(window.location.pathname).toBe(paths.index);
      expect(screen.queryByRole('heading', { name: 'team_seatings.integrations.heading' })).not.toBeInTheDocument();
      expect(listIntegrationClientsMock).not.toHaveBeenCalled();
    },
  );
});
