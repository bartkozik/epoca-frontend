import { useAuth } from '@/modules/auth/AuthProvider';
import { OrganizationUserRole } from '@/modules/organizations/types';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { Outlet } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import Router from './Router';

vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({ useWorkspace: vi.fn() }));

vi.mock('@/app/navbar', () => ({ __esModule: true, default: () => <div>navbar</div> }));
vi.mock('@/app/routing/errorBoundary', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/app/routing/nonAuthedPageLayout', () => ({
  __esModule: true,
  default: () => (
    <div>
      non-authed
      <Outlet />
    </div>
  ),
}));
vi.mock('@/modules/auth/login/Login', () => ({ __esModule: true, default: () => <div>login</div> }));
vi.mock('@/modules/auth/passwordNew/PasswordNew', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/auth/passwordReset/PasswordReset', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/auth/signup/Signup', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/clients/Clients', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/clients/clientDetails/ClientDetails', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/organizations/workspaceSelect/WorkspaceSelect', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/projects/Projects', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/projects/projectDetails/ProjectDetails', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/reports/pivotTable/PivotTable', () => ({ __esModule: true, default: () => <div>pivot-table</div> }));
vi.mock('@/modules/reports/report/Report', () => ({ __esModule: true, default: () => <div>report</div> }));
vi.mock('@/modules/ssoAuth/ssoLoginCallback/SsoLoginCallback', () => ({
  __esModule: true,
  default: () => <div>sso-callback</div>,
}));
vi.mock('@/modules/teamSettings/TeamSettings', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/teamSettings/members/memberProjectsTable/MemberProjectsTable', () => ({
  __esModule: true,
  default: () => null,
}));
vi.mock('@/modules/workingTime/WorkingTime', () => ({ __esModule: true, default: () => <div>working-time</div> }));
vi.mock('./ScrollToTop', () => ({ __esModule: true, default: () => null }));

const useAuthMock = vi.mocked(useAuth);
const useWorkspaceMock = vi.mocked(useWorkspace);

const renderRouter = (role: OrganizationUserRole): void => {
  useAuthMock.mockReturnValue({
    hasAccess: vi.fn((allowedRoles: OrganizationUserRole[]) => allowedRoles.includes(role)),
    hasAccessInOrganization: vi.fn((_organizationId: string, allowedRoles: OrganizationUserRole[]) =>
      allowedRoles.includes(role),
    ),
    isAuthenticated: true,
  } as unknown as ReturnType<typeof useAuth>);
  useWorkspaceMock.mockReturnValue({
    contextOrganizationId: 'workspace-1',
    contextOrganizationLoadFailure: null,
    isContextOrganizationSlugInLocalStorage: true,
  } as ReturnType<typeof useWorkspace>);
  window.history.pushState({}, '', '/pivot-table?clients=c1&startDate=2026-08-01');
  render(<Router />);
};

describe('Router pivot permissions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([OrganizationUserRole.Owner, OrganizationUserRole.Manager])(
    'renders the pivot table for %s',
    async (role) => {
      renderRouter(role);

      expect(await screen.findByText('pivot-table')).toBeInTheDocument();
    },
  );

  it.each([OrganizationUserRole.Employee, OrganizationUserRole.External])(
    'redirects %s with replace before mounting the pivot table',
    async (role) => {
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
      renderRouter(role);

      expect(await screen.findByText('working-time')).toBeInTheDocument();
      await waitFor(() => expect(replaceStateSpy).toHaveBeenCalledWith(expect.anything(), '', '/working-time'));
      expect(screen.queryByText('pivot-table')).not.toBeInTheDocument();
    },
  );
});

vi.mock('@/modules/auth/invitationAccess/InvitationAccess', () => ({ default: () => <div>invitation-recipient</div> }));
vi.mock('@/modules/auth/invitationAccess/InvitationSignIn', () => ({ default: () => <div>invitation-sign-in</div> }));
it.each([
  [false, false],
  [true, false],
  [true, true],
])(
  'exposes recipient and fixed sign-in routes with authenticated=%s workspace=%s',
  async (isAuthenticated, selected) => {
    useAuthMock.mockReturnValue({ isAuthenticated } as ReturnType<typeof useAuth>);
    useWorkspaceMock.mockReturnValue({ isContextOrganizationSlugInLocalStorage: selected } as ReturnType<
      typeof useWorkspace
    >);
    window.history.replaceState({}, '', '/invitations/accept');
    const view = render(<Router />);
    expect(await screen.findByText('invitation-recipient')).toBeInTheDocument();
    view.unmount();
    window.history.replaceState({}, '', '/invitations/sign-in');
    render(<Router />);
    expect(await screen.findByText('invitation-sign-in')).toBeInTheDocument();
  },
);

it.each([
  [false, false],
  [true, false],
  [true, true],
])('exposes SAML callback with authenticated=%s workspace=%s', async (isAuthenticated, selected) => {
  useAuthMock.mockReturnValue({ isAuthenticated } as ReturnType<typeof useAuth>);
  useWorkspaceMock.mockReturnValue({ isContextOrganizationSlugInLocalStorage: selected } as ReturnType<
    typeof useWorkspace
  >);
  window.history.replaceState({}, '', '/login-sso#token=one-time&slug=target');
  render(<Router />);
  expect(await screen.findByText('sso-callback')).toBeInTheDocument();
  expect(screen.getByText('non-authed')).toBeInTheDocument();
});
