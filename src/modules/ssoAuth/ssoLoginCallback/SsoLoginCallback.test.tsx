import { paths } from '@/app/routing/paths';
import * as requests from '@/modules/ssoAuth/requests';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import SsoLoginCallback from './SsoLoginCallback';

const { auth, workspace, navigate } = vi.hoisted(() => ({
  auth: {
    loggedInUser: undefined as { id: string } | undefined,
    persistSession: vi.fn(),
    persistRefreshToken: vi.fn(),
  },
  workspace: {
    contextOrganizationSlug: null as string | null,
    checkIfContextOrganizationSlugIsInLocalStorage: vi.fn(),
  },
  navigate: vi.fn(),
}));
vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({ useWorkspace: () => workspace }));
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => navigate,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/core/utils/hooks', () => ({ useTitle: vi.fn() }));
vi.mock('@/modules/ssoAuth/requests', async () => ({
  ...(await vi.importActual('@/modules/ssoAuth/requests')),
  samlLogin: vi.fn(),
}));
let client: QueryClient;
function tree(): JSX.Element {
  return (
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <SsoLoginCallback />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>
  );
}
function mount(fragment = '#token=saml-secret&slug=target'): ReturnType<typeof render> {
  window.history.replaceState({}, '', `/login-sso${fragment}`);
  return render(tree());
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  auth.loggedInUser = undefined;
  workspace.contextOrganizationSlug = null;
  client = new QueryClient();
  vi.mocked(requests.samlLogin).mockResolvedValue({ accessToken: 'jwt', refreshToken: 'refresh' });
});
afterEach(() => {
  client.clear();
  localStorage.clear();
});
it('removes the fragment before exchange and exchanges once under StrictMode; stores only opaque action and safe outcome', async () => {
  vi.mocked(requests.samlLogin).mockImplementation(() => {
    expect(window.location.hash).toBe('');
    return Promise.resolve({ accessToken: 'jwt', refreshToken: 'refresh' });
  });
  mount();
  await waitFor(() => expect(navigate).toHaveBeenCalledWith(paths.index, { replace: true }));
  expect(requests.samlLogin).toHaveBeenCalledExactlyOnceWith('target', 'saml-secret');
  expect(auth.persistSession).toHaveBeenCalledWith('jwt', 'target');
  expect(auth.persistRefreshToken).toHaveBeenCalledWith('refresh');
  expect(workspace.checkIfContextOrganizationSlugIsInLocalStorage).toHaveBeenCalledOnce();
  const mutation = client.getMutationCache().getAll()[0];
  expect(typeof mutation.state.variables).toBe('function');
  expect(mutation.state.data).toBe('session');
  expect(mutation.options.gcTime).toBe(0);
  expect(JSON.stringify(mutation.state)).not.toMatch(/saml-secret|jwt|refresh/);
});
it.each(['CreateAccount', 'SignIn', 'Accept', 'VerifyLegacySso'] as const)(
  'returns %s continuation to fixed invitation route without persisting or loading workspace',
  async (nextAction) => {
    vi.mocked(requests.samlLogin).mockResolvedValue({ kind: 'invitation', organizationSlug: 'target', nextAction });
    mount();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/invitations/accept', { replace: true }));
    expect(auth.persistSession).not.toHaveBeenCalled();
    expect(auth.persistRefreshToken).not.toHaveBeenCalled();
    expect(workspace.checkIfContextOrganizationSlugIsInLocalStorage).not.toHaveBeenCalled();
    expect(client.getMutationCache().getAll()[0].state.data).toBe('invitation');
  },
);
it('consumes only a fixed invitation return marker on normal SSO success', async () => {
  sessionStorage.setItem('epoca:sso-invitation-return', '1');
  mount();
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/invitations/accept', { replace: true }));
  expect(sessionStorage.getItem('epoca:sso-invitation-return')).toBeNull();
});
it('ignores arbitrary return marker values', async () => {
  sessionStorage.setItem('epoca:sso-invitation-return', 'https://evil.example');
  mount();
  await waitFor(() => expect(navigate).toHaveBeenCalledWith(paths.index, { replace: true }));
});
it.each([403, 500])('preserves controlled status %s error handling without raw error cache', async (status) => {
  vi.mocked(requests.samlLogin).mockRejectedValue({
    isAxiosError: true,
    config: { data: 'saml-secret' },
    response: { status, config: { headers: {} } },
  });
  mount();
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith(`/login?errorCode=${status}&reason=unknown`, { replace: true }),
  );
  expect(JSON.stringify(client.getMutationCache().getAll()[0].state)).not.toContain('saml-secret');
  expect(auth.persistSession).not.toHaveBeenCalled();
});
it('clears missing callback fragments and reports missing parameters', async () => {
  mount('#token=saml-secret');
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith('/login?errorCode=404&reason=missing_token_or_slug', { replace: true }),
  );
  expect(window.location.hash).toBe('');
  expect(requests.samlLogin).not.toHaveBeenCalled();
});
it.each(['unmount', 'account', 'workspace'])('rejects late sessions after %s', async (change) => {
  let resolve!: (value: { accessToken: string; refreshToken: string }) => void;
  vi.mocked(requests.samlLogin).mockReturnValue(
    new Promise((yes) => {
      resolve = yes;
    }),
  );
  const view = mount();
  await waitFor(() => expect(requests.samlLogin).toHaveBeenCalledOnce());
  if (change === 'unmount') view.unmount();
  else {
    if (change === 'account') auth.loggedInUser = { id: 'other' };
    else workspace.contextOrganizationSlug = 'other';
    view.rerender(tree());
  }
  await act(async () => {
    resolve({ accessToken: 'jwt', refreshToken: 'refresh' });
    await Promise.resolve();
  });
  expect(auth.persistSession).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});

it('uses fixed ordinary sign-in recovery for an already authenticated callback failure', async () => {
  auth.loggedInUser = { id: 'user-1' };
  vi.mocked(requests.samlLogin).mockRejectedValue(new Error('do-not-expose'));
  mount();
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith('/invitations/sign-in?errorCode=unknown&reason=unknown&sessionRecovery=1', {
      replace: true,
    }),
  );
});
it.each(['account', 'workspace'])(
  'rejects a stale callback after synchronous stored %s change before provider rerender',
  async (change) => {
    let resolve!: (value: { accessToken: string; refreshToken: string }) => void;
    vi.mocked(requests.samlLogin).mockReturnValue(
      new Promise((yes) => {
        resolve = yes;
      }),
    );
    mount();
    await waitFor(() => expect(requests.samlLogin).toHaveBeenCalledOnce());
    const { saveSession } = await import('@/core/api');
    const { saveContextOrganizationSlugInLS } = await import('@/modules/organizations/utils');
    if (change === 'account')
      saveSession(`header.${btoa(JSON.stringify({ id: 'different-user', exp: 4102444800, roles: [] }))}.sig`);
    else saveContextOrganizationSlugInLS('other-workspace');
    await act(async () => {
      resolve({ accessToken: 'jwt', refreshToken: 'refresh' });
      await Promise.resolve();
    });
    expect(auth.persistSession).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    localStorage.clear();
  },
);
