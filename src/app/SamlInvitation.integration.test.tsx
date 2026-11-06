import { getRefreshToken, queryClient, readStoredSession, saveSession } from '@/core/api';
import { LOCAL_STORAGE_AUTH_NAME } from '@/core/config/localStorageKeys';
import { AuthProvider, useAuth } from '@/modules/auth/AuthProvider';
import * as invitationRequests from '@/modules/auth/invitationAccess/requests';
import * as orgRequests from '@/modules/organizations/requests';
import {
  getContextOrganizationIdFromLS,
  getContextOrganizationSlugFromLS,
  saveContextOrganizationSlugInLS,
} from '@/modules/organizations/utils';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import * as ssoRequests from '@/modules/ssoAuth/requests';
import { StrictMode, type PropsWithChildren } from 'react';
import { Outlet } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SessionProviders } from './App';

vi.mock('@/modules/clients/ClientsProvider', () => ({
  ClientsProvider: ({ children }: PropsWithChildren) => children,
}));
vi.mock('@/modules/projects/ProjectsProvider', () => ({
  ProjectsProvider: ({ children }: PropsWithChildren) => children,
}));
vi.mock('@/modules/workingTime/UnitWorkspaceProvider', () => ({
  UnitWorkspaceProvider: ({ children }: PropsWithChildren) => children,
}));
vi.mock('@tanstack/react-query-devtools', () => ({ ReactQueryDevtools: () => null }));
vi.mock('@/core/providers/toastProvider', () => ({
  default: () => null,
  ToastProvider: ({ children }: PropsWithChildren) => children,
}));
vi.mock('@/app/navbar', () => ({ default: () => null }));
vi.mock('@/app/routing/nonAuthedPageLayout', () => ({ default: () => <Outlet /> }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/modules/auth/requests', () => ({ invalidateRefreshToken: vi.fn() }));
vi.mock('@/modules/ssoAuth/requests', () => ({ samlLogin: vi.fn() }));
vi.mock('@/modules/organizations/requests', () => ({
  getOrganizationBySlug: vi.fn(),
  getOrganizationUsers: vi.fn(),
  getOrganizationUserProjects: vi.fn(),
}));
vi.mock('@/modules/auth/invitationAccess/requests', async () => ({
  ...(await vi.importActual('@/modules/auth/invitationAccess/requests')),
  getInvitationSummary: vi.fn(),
  acceptInvitation: vi.fn(),
}));
vi.mock('@/modules/auth/login/Login', () => ({ default: () => <div>login-error</div> }));
vi.mock('@/modules/workingTime/WorkingTime', () => {
  const WorkspaceProbe = (): JSX.Element => {
    const auth = useAuth();
    const workspace = useWorkspace();
    return (
      <div>
        workspace-loaded:{auth.loggedInUser?.id}:{workspace.contextOrganizationSlug}:{workspace.contextOrganizationId}
      </div>
    );
  };
  return { default: WorkspaceProbe };
});
const accessToken = `header.${btoa(
  JSON.stringify({
    id: 'user-1',
    exp: 4102444800,
    identities: [],
    roles: [
      { organizationId: 'org-target', roles: ['Owner'] },
      { organizationId: 'org-old', roles: ['Owner'] },
    ],
  }),
)}.sig`;
function mount(path = '/login-sso#token=one-time&slug=target'): void {
  window.history.replaceState({}, '', path);
  render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SessionProviders />
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.mocked(orgRequests.getOrganizationBySlug).mockImplementation((slug) =>
    Promise.resolve({ data: { id: `org-${slug}`, slug, name: slug, archivedAt: null } } as Awaited<
      ReturnType<typeof orgRequests.getOrganizationBySlug>
    >),
  );
  vi.mocked(orgRequests.getOrganizationUsers).mockResolvedValue({ data: [] } as unknown as Awaited<
    ReturnType<typeof orgRequests.getOrganizationUsers>
  >);
  vi.mocked(orgRequests.getOrganizationUserProjects).mockResolvedValue({ data: [] } as unknown as Awaited<
    ReturnType<typeof orgRequests.getOrganizationUserProjects>
  >);
  vi.mocked(ssoRequests.samlLogin).mockResolvedValue({ accessToken, refreshToken: 'refresh' });
  vi.mocked(invitationRequests.getInvitationSummary).mockResolvedValue({
    organization: { slug: 'target', name: 'Invited target' },
    email: 'invited@example.com',
    firstName: null,
    lastName: null,
    roles: ['Employee'],
    revision: '1',
    expiresAt: '2026-12-01T00:00:00Z',
    csrfToken: 'csrf',
    ssoEnabled: true,
    nextAction: 'Accept',
  });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  localStorage.clear();
  sessionStorage.clear();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});
it.each([false, true])(
  'persists and navigates normal SSO with real keyed SessionProviders, same-user=%s',
  async (sameUser) => {
    if (sameUser) {
      saveSession(accessToken);
      saveContextOrganizationSlugInLS('old');
    }
    mount();
    expect(await screen.findByText('workspace-loaded:user-1:target:org-target')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/working-time');
    expect(window.location.hash).toBe('');
    expect(getContextOrganizationSlugFromLS()).toBe('target');
    expect(getContextOrganizationIdFromLS()).toBe('org-target');
    expect(getRefreshToken()).toBe('refresh');
    expect(ssoRequests.samlLogin).toHaveBeenCalledExactlyOnceWith('target', 'one-time');
  },
);
it('preserves the current workspace after an invalid session token', async () => {
  saveSession(accessToken);
  saveContextOrganizationSlugInLS('old');
  vi.mocked(ssoRequests.samlLogin).mockResolvedValue({ accessToken: 'invalid-token', refreshToken: 'invalid-refresh' });
  mount();
  await screen.findByText('login-error');
  expect(getContextOrganizationSlugFromLS()).toBe('old');
  expect(getRefreshToken()).toBeNull();
  expect(orgRequests.getOrganizationBySlug).not.toHaveBeenCalledWith('target');
});
it('returns normal SSO from fixed sign-in to the invitation after the real session remount', async () => {
  sessionStorage.setItem('epoca:sso-invitation-return', '1');
  mount();
  expect(await screen.findByText('Invited target')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/invitations/accept');
  expect(getRefreshToken()).toBe('refresh');
  expect(invitationRequests.getInvitationSummary).toHaveBeenCalledWith(accessToken);
  expect(screen.queryByTestId('invitationPassword')).not.toBeInTheDocument();
});
it('reloads continuation summary from its cookie without creating a global session or loading an organization', async () => {
  vi.mocked(ssoRequests.samlLogin).mockResolvedValue({
    kind: 'invitation',
    organizationSlug: 'target',
    nextAction: 'Accept',
  });
  mount();
  expect(await screen.findByText('Invited target')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/invitations/accept');
  expect(readStoredSession().status).not.toBe('valid');
  expect(orgRequests.getOrganizationBySlug).not.toHaveBeenCalled();
  expect(getRefreshToken()).toBeNull();
  expect(invitationRequests.getInvitationSummary).toHaveBeenCalledExactlyOnceWith(undefined);
});
it('keeps another workspace session intact on a continuation, without fetching the invitation target', async () => {
  saveSession(accessToken);
  saveContextOrganizationSlugInLS('old');
  vi.mocked(ssoRequests.samlLogin).mockResolvedValue({
    kind: 'invitation',
    organizationSlug: 'target',
    nextAction: 'SignIn',
  });
  mount();
  await screen.findByText('Invited target');
  expect(getContextOrganizationSlugFromLS()).toBe('old');
  expect(getRefreshToken()).toBeNull();
  expect(orgRequests.getOrganizationBySlug).not.toHaveBeenCalledWith('target');
});
it('does not persist a late callback after leaving the route', async () => {
  let resolve!: (value: { accessToken: string; refreshToken: string }) => void;
  vi.mocked(ssoRequests.samlLogin).mockReturnValue(
    new Promise((yes) => {
      resolve = yes;
    }),
  );
  mount();
  await waitFor(() => expect(ssoRequests.samlLogin).toHaveBeenCalledOnce());
  cleanup();
  await act(async () => {
    resolve({ accessToken, refreshToken: 'refresh' });
    await Promise.resolve();
  });
  expect(readStoredSession().status).not.toBe('valid');
  expect(getRefreshToken()).toBeNull();
});

it('keeps committed invitation recovery across the real anonymous-to-user provider remount when refresh storage fails', async () => {
  const invitation = await invitationRequests.getInvitationSummary();
  vi.mocked(invitationRequests.getInvitationSummary)
    .mockClear()
    .mockResolvedValue({ ...invitation, nextAction: 'CreateAccount' });
  vi.mocked(invitationRequests.acceptInvitation).mockResolvedValue({
    organizationSlug: 'target',
    accessToken,
    refreshToken: 'refresh',
  });
  // eslint-disable-next-line vitest/unbound-method
  const setItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === LOCAL_STORAGE_AUTH_NAME.REFRESH_TOKEN) throw new Error('synthetic refresh storage failure');
    setItem.call(this, key, value);
  });
  mount('/invitations/accept');
  fireEvent.change(await screen.findByTestId('invitationPassword'), { target: { value: 'Password1~' } });
  fireEvent.change(screen.getByTestId('invitationConfirmation'), { target: { value: 'Password1~' } });
  fireEvent.click(screen.getByTestId('invitationSubmit'));
  await screen.findByText('login-error');
  expect(window.location.pathname + window.location.search).toBe('/invitations/sign-in?joined=1');
  const stored = readStoredSession();
  expect(stored.status === 'valid' && stored.session.user.id).toBe('user-1');
  expect(getRefreshToken()).toBeNull();
  expect(invitationRequests.acceptInvitation).toHaveBeenCalledOnce();
  expect(invitationRequests.getInvitationSummary).toHaveBeenCalledOnce();
  expect(screen.queryByTestId('invitationSubmit')).not.toBeInTheDocument();
  expect(screen.queryByText(/workspace-loaded/)).not.toBeInTheDocument();
});

it.each([
  { sameUser: false, invitationReturn: false },
  { sameUser: true, invitationReturn: false },
  { sameUser: false, invitationReturn: true },
])('recovers a partial SSO session across real providers: %j', async ({ sameUser, invitationReturn }) => {
  if (sameUser) {
    saveSession(accessToken);
    saveContextOrganizationSlugInLS('old');
  }
  if (invitationReturn) sessionStorage.setItem('epoca:sso-invitation-return', '1');
  // eslint-disable-next-line vitest/unbound-method
  const setItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === LOCAL_STORAGE_AUTH_NAME.REFRESH_TOKEN) throw new Error('synthetic refresh storage failure');
    setItem.call(this, key, value);
  });
  mount();
  await waitFor(() => expect(window.location.pathname).toBe('/invitations/sign-in'));
  const params = new URLSearchParams(window.location.search);
  expect(params.get('sessionRecovery')).toBe(invitationReturn ? null : '1');
  expect(params.get('errorCode')).toBe('unknown');
  expect(window.location.hash).toBe('');
  expect(getRefreshToken()).toBeNull();
  expect(ssoRequests.samlLogin).toHaveBeenCalledExactlyOnceWith('target', 'one-time');
  expect(invitationRequests.getInvitationSummary).not.toHaveBeenCalled();
  expect(screen.queryByText(/workspace-loaded/)).not.toBeInTheDocument();
});
