import { saveSession } from '@/core/api';
import { saveContextOrganizationSlugInLS } from '@/modules/organizations/utils';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InvitationJoined, InvitationSummary } from '../models/invitationAccess.model';
import InvitationAccess from './InvitationAccess';
import { InvitationAccessError } from './problem';
import * as requests from './requests';

const { auth, workspace, navigate } = vi.hoisted(() => ({
  auth: {
    session: null as { token: string } | null,
    loggedInUser: undefined as { id: string } | undefined,
    persistSession: vi.fn(),
    persistRefreshToken: vi.fn(),
  },
  workspace: {
    contextOrganizationSlug: '',
    contextOrganizationId: null as string | null,
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
vi.mock('./requests', async () => ({
  ...(await vi.importActual('./requests')),
  exchangeInvitation: vi.fn(),
  getInvitationSummary: vi.fn(),
  acceptInvitation: vi.fn(),
  startInvitationSaml: vi.fn(),
}));
const summary: InvitationSummary = {
  organization: { name: 'Target organization', slug: 'target' },
  email: 'recipient@example.com',
  firstName: null,
  lastName: null,
  roles: ['Employee'],
  revision: '1',
  csrfToken: 'csrf-secret',
  expiresAt: '2026-12-01T00:00:00Z',
  nextAction: 'CreateAccount',
  ssoEnabled: false,
};
const joined: InvitationJoined = { organizationSlug: 'target', accessToken: 'jwt-new', refreshToken: 'refresh-new' };
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function mount(): ReturnType<typeof render> {
  return render(
    <StrictMode>
      <MemoryRouter>
        <InvitationAccess />
      </MemoryRouter>
    </StrictMode>,
  );
}
async function fillPassword(): Promise<void> {
  fireEvent.change(await screen.findByTestId('invitationPassword'), { target: { value: 'Password1~' } });
  fireEvent.change(screen.getByTestId('invitationConfirmation'), { target: { value: 'Password1~' } });
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  auth.session = null;
  auth.loggedInUser = undefined;
  workspace.contextOrganizationId = null;
  workspace.contextOrganizationSlug = '';
  window.history.replaceState({}, '', '/invitations/accept');
  vi.mocked(requests.exchangeInvitation).mockResolvedValue(summary);
  vi.mocked(requests.getInvitationSummary).mockResolvedValue(summary);
  vi.mocked(requests.acceptInvitation).mockResolvedValue(joined);
});
it('removes the fragment before the single StrictMode exchange and stores no capability', async () => {
  window.history.replaceState({}, '', '/invitations/accept#token=mail-secret');
  const storage = vi.spyOn(Storage.prototype, 'setItem');
  vi.mocked(requests.exchangeInvitation).mockImplementation(() => {
    expect(window.location.hash).toBe('');
    return Promise.resolve(summary);
  });
  mount();
  expect(await screen.findByText('Target organization')).toBeInTheDocument();
  expect(requests.exchangeInvitation).toHaveBeenCalledExactlyOnceWith('mail-secret', undefined);
  expect(requests.getInvitationSummary).not.toHaveBeenCalled();
  expect(storage).not.toHaveBeenCalled();
  storage.mockRestore();
});
it('reloads cookie context and shows immutable recipient and roles', async () => {
  mount();
  expect(await screen.findByText('recipient@example.com')).toBeInTheDocument();
  expect(screen.getByText('Employee')).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(requests.getInvitationSummary).toHaveBeenCalledOnce();
});
it('requires matching passwords before accepting and persists target only after Joined', async () => {
  const pending = deferred<InvitationJoined>();
  vi.mocked(requests.acceptInvitation).mockReturnValue(pending.promise);
  mount();
  await fillPassword();
  fireEvent.change(screen.getByTestId('invitationConfirmation'), { target: { value: 'mismatch' } });
  fireEvent.click(screen.getByTestId('invitationSubmit'));
  expect(requests.acceptInvitation).not.toHaveBeenCalled();
  fireEvent.change(screen.getByTestId('invitationConfirmation'), { target: { value: 'Password1~' } });
  fireEvent.click(screen.getByTestId('invitationSubmit'));
  fireEvent.click(screen.getByTestId('invitationSubmit'));
  expect(requests.acceptInvitation).toHaveBeenCalledExactlyOnceWith(summary, undefined, 'Password1~');
  expect(auth.persistSession).not.toHaveBeenCalled();
  await act(async () => {
    pending.resolve(joined);
    await pending.promise;
  });
  expect(auth.persistSession).toHaveBeenCalledWith('jwt-new', 'target');
  expect(workspace.checkIfContextOrganizationSlugIsInLocalStorage).toHaveBeenCalledOnce();
});
it.each(['SignIn', 'VerifyLegacySso'] as const)('never offers password creation for %s', async (nextAction) => {
  vi.mocked(requests.getInvitationSummary).mockResolvedValue({ ...summary, nextAction });
  mount();
  await screen.findByText('Target organization');
  expect(screen.queryByTestId('invitationPassword')).not.toBeInTheDocument();
  expect(screen.getByRole('link')).toHaveAttribute('href', '/invitations/sign-in');
});
it('passes current raw bearer and accepts an existing account without a password', async () => {
  auth.session = { token: 'current-jwt' };
  auth.loggedInUser = { id: 'user-1' };
  storeUser('user-1');
  vi.mocked(requests.getInvitationSummary).mockResolvedValue({ ...summary, nextAction: 'Accept' });
  mount();
  await screen.findByText('Target organization');
  fireEvent.click(screen.getByTestId('invitationSubmit'));
  await waitFor(() => expect(auth.persistSession).toHaveBeenCalled());
  expect(requests.acceptInvitation).toHaveBeenCalledWith(
    expect.objectContaining({ nextAction: 'Accept' }),
    'current-jwt',
    undefined,
  );
});
it.each(['identity-mismatch', 'sign-in-required'] as const)('offers fixed reauthentication for %s', async (code) => {
  vi.mocked(requests.getInvitationSummary).mockRejectedValue(new InvitationAccessError(code));
  mount();
  expect(await screen.findByRole('link')).toHaveAttribute('href', '/invitations/sign-in');
  expect(screen.queryByTestId('invitationPassword')).not.toBeInTheDocument();
});
it('shows invalid or expired invitation without acceptance', async () => {
  vi.mocked(requests.getInvitationSummary).mockRejectedValue(new InvitationAccessError('invalid-invitation'));
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('auth.invitation.errors.invalid-invitation');
  expect(screen.queryByTestId('invitationSubmit')).not.toBeInTheDocument();
});
it('refreshes changed roles and preserves draft but requires another manual acceptance', async () => {
  vi.mocked(requests.acceptInvitation).mockRejectedValueOnce(new InvitationAccessError('revision-conflict'));
  vi.mocked(requests.getInvitationSummary)
    .mockResolvedValueOnce(summary)
    .mockResolvedValueOnce({ ...summary, revision: '2', roles: ['Manager'], csrfToken: 'new-csrf' });
  mount();
  await fillPassword();
  fireEvent.click(screen.getByTestId('invitationSubmit'));
  expect(await screen.findByText('Manager')).toBeInTheDocument();
  expect(screen.getByTestId('invitationPassword')).toHaveValue('Password1~');
  expect(requests.acceptInvitation).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByTestId('invitationSubmit'));
  await waitFor(() => expect(requests.acceptInvitation).toHaveBeenCalledTimes(2));
  expect(requests.acceptInvitation).toHaveBeenLastCalledWith(
    expect.objectContaining({ revision: '2', csrfToken: 'new-csrf' }),
    undefined,
    'Password1~',
  );
});
it('reports committed membership when session issuance fails and never retries acceptance', async () => {
  vi.mocked(requests.acceptInvitation).mockRejectedValueOnce(new InvitationAccessError('session-issue-failed'));
  mount();
  await fillPassword();
  fireEvent.click(screen.getByTestId('invitationSubmit'));
  expect(await screen.findByRole('alert')).toHaveTextContent('auth.invitation.errors.session-issue-failed');
  expect(screen.queryByTestId('invitationSubmit')).not.toBeInTheDocument();
  expect(auth.persistSession).not.toHaveBeenCalled();
  expect(screen.getByRole('link')).toHaveAttribute('href', '/invitations/sign-in?joined=1');
});
it.each(['account', 'workspace'])('ignores a pending Joined result after a real %s change', async (changed) => {
  const pending = deferred<InvitationJoined>();
  vi.mocked(requests.acceptInvitation).mockReturnValue(pending.promise);
  const view = mount();
  await fillPassword();
  fireEvent.click(screen.getByTestId('invitationSubmit'));
  if (changed === 'account') auth.loggedInUser = { id: 'other' };
  else workspace.contextOrganizationSlug = 'other-workspace';
  view.rerender(
    <StrictMode>
      <MemoryRouter>
        <InvitationAccess />
      </MemoryRouter>
    </StrictMode>,
  );
  await act(async () => {
    pending.resolve(joined);
    await pending.promise;
  });
  expect(auth.persistSession).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});

it('treats local persistence failure after Joined as committed membership', async () => {
  auth.persistSession.mockImplementationOnce(() => {
    throw new Error('invalid session');
  });
  mount();
  await fillPassword();
  fireEvent.click(screen.getByTestId('invitationSubmit'));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/invitations/sign-in?joined=1', { replace: true }));
  expect(workspace.checkIfContextOrganizationSlugIsInLocalStorage).not.toHaveBeenCalled();
});
it('rate limits manual refresh and never retries automatically', async () => {
  vi.mocked(requests.getInvitationSummary).mockRejectedValueOnce(new InvitationAccessError('rate-limited', 1));
  mount();
  const retry = await screen.findByRole('button', { name: 'auth.invitation.retry' });
  expect(retry).toBeDisabled();
  expect(requests.getInvitationSummary).toHaveBeenCalledOnce();
  await waitFor(() => expect(retry).toBeEnabled(), { timeout: 2000 });
  expect(requests.getInvitationSummary).toHaveBeenCalledOnce();
  fireEvent.click(retry);
  expect(await screen.findByText('Target organization')).toBeInTheDocument();
});
it('does not reuse the old revision when conflict refresh fails', async () => {
  vi.mocked(requests.acceptInvitation).mockRejectedValueOnce(new InvitationAccessError('revision-conflict'));
  vi.mocked(requests.getInvitationSummary)
    .mockResolvedValueOnce(summary)
    .mockRejectedValueOnce(new InvitationAccessError('invalid-invitation'));
  mount();
  await fillPassword();
  fireEvent.click(screen.getByTestId('invitationSubmit'));
  expect(await screen.findByRole('alert')).toHaveTextContent('auth.invitation.errors.invalid-invitation');
  expect(screen.queryByTestId('invitationSubmit')).not.toBeInTheDocument();
});
it('ignores pending acceptance after unmount', async () => {
  const pending = deferred<InvitationJoined>();
  vi.mocked(requests.acceptInvitation).mockReturnValueOnce(pending.promise);
  const view = mount();
  await fillPassword();
  fireEvent.click(screen.getByTestId('invitationSubmit'));
  view.unmount();
  await act(async () => {
    pending.resolve(joined);
    await pending.promise;
  });
  expect(auth.persistSession).not.toHaveBeenCalled();
});

it('manually retries a rate-limited exchange with its in-memory capability after cooldown', async () => {
  window.history.replaceState({}, '', '/invitations/accept#token=mail-secret');
  vi.mocked(requests.exchangeInvitation).mockRejectedValueOnce(new InvitationAccessError('rate-limited', 1));
  mount();
  const retry = await screen.findByRole('button', { name: 'auth.invitation.retry' });
  expect(window.location.hash).toBe('');
  expect(requests.exchangeInvitation).toHaveBeenCalledOnce();
  await waitFor(() => expect(retry).toBeEnabled(), { timeout: 2000 });
  fireEvent.click(retry);
  expect(await screen.findByText('Target organization')).toBeInTheDocument();
  expect(requests.exchangeInvitation).toHaveBeenCalledTimes(2);
  expect(requests.getInvitationSummary).not.toHaveBeenCalled();
});

it('keeps the mail token through repeated transient exchange failures until a manual retry succeeds', async () => {
  window.history.replaceState({}, '', '/invitations/accept#token=mail-secret');
  vi.mocked(requests.exchangeInvitation).mockRejectedValue(new InvitationAccessError('unavailable'));
  vi.mocked(requests.getInvitationSummary).mockRejectedValue(new InvitationAccessError('invalid-invitation'));
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('auth.invitation.errors.unavailable');
  expect(window.location.hash).toBe('');
  expect(requests.exchangeInvitation).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'auth.invitation.retry' }));
  await waitFor(() => expect(requests.exchangeInvitation).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByRole('button', { name: 'auth.invitation.retry' })).toBeEnabled());
  vi.mocked(requests.exchangeInvitation).mockResolvedValue(summary);
  fireEvent.click(screen.getByRole('button', { name: 'auth.invitation.retry' }));
  expect(await screen.findByText('Target organization')).toBeInTheDocument();
  expect(requests.exchangeInvitation).toHaveBeenLastCalledWith('mail-secret', undefined);
  expect(requests.getInvitationSummary).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});

it('honors cooldown when refreshing the summary after a revision conflict is rate limited', async () => {
  vi.mocked(requests.acceptInvitation).mockRejectedValueOnce(new InvitationAccessError('revision-conflict'));
  vi.mocked(requests.getInvitationSummary)
    .mockResolvedValueOnce(summary)
    .mockRejectedValueOnce(new InvitationAccessError('rate-limited', 1));
  mount();
  await fillPassword();
  fireEvent.click(screen.getByTestId('invitationSubmit'));
  expect(await screen.findByRole('button', { name: 'auth.invitation.retry' })).toBeDisabled();
  expect(screen.queryByTestId('invitationSubmit')).not.toBeInTheDocument();
});

it.each(['exchange', 'summary'])('keeps the pending %s when the current workspace ID hydrates', async (operation) => {
  auth.loggedInUser = { id: 'same-user' };
  auth.session = { token: 'same-jwt' };
  storeUser('same-user');
  workspace.contextOrganizationSlug = 'persisted-workspace';
  saveContextOrganizationSlugInLS('persisted-workspace');
  const pending = deferred<InvitationSummary>();
  if (operation === 'exchange') {
    window.history.replaceState({}, '', '/invitations/accept#token=mail-secret');
    vi.mocked(requests.exchangeInvitation).mockReturnValueOnce(pending.promise);
  } else vi.mocked(requests.getInvitationSummary).mockReturnValue(pending.promise);
  const view = mount();
  workspace.contextOrganizationId = 'hydrated-workspace-id';
  view.rerender(
    <StrictMode>
      <MemoryRouter>
        <InvitationAccess />
      </MemoryRouter>
    </StrictMode>,
  );
  expect(requests.exchangeInvitation).toHaveBeenCalledTimes(operation === 'exchange' ? 1 : 0);
  expect(requests.getInvitationSummary).toHaveBeenCalledTimes(operation === 'summary' ? 1 : 0);
  await act(async () => {
    pending.resolve(summary);
    await pending.promise;
  });
  expect(screen.getByText('Target organization')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it.each(['CreateAccount', 'SignIn', 'VerifyLegacySso'] as const)(
  'offers server target SSO for %s and submits the returned GET form',
  async (nextAction) => {
    auth.session = { token: 'current-jwt' };
    vi.mocked(requests.getInvitationSummary).mockResolvedValue({ ...summary, ssoEnabled: true, nextAction });
    vi.mocked(requests.startInvitationSaml).mockResolvedValue({
      samlRequest: 'server-request',
      ssoUrl: 'https://target-idp.example/sso',
    });
    const submitForm = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (
      this: HTMLFormElement,
    ) {
      expect(this.action).toBe('https://target-idp.example/sso');
      expect(this.method).toBe('get');
      expect(new FormData(this).get('SAMLRequest')).toBe('server-request');
    });
    mount();
    fireEvent.click(await screen.findByTestId('invitationSso'));
    await waitFor(() => expect(submitForm).toHaveBeenCalledOnce());
    expect(requests.startInvitationSaml).toHaveBeenCalledExactlyOnceWith('csrf-secret', 'current-jwt');
    expect(requests.acceptInvitation).not.toHaveBeenCalled();
    expect(auth.persistSession).not.toHaveBeenCalled();
    submitForm.mockRestore();
  },
);
it.each([
  ['Accept', true],
  ['CreateAccount', false],
] as const)('does not offer target SSO for nextAction=%s ssoEnabled=%s', async (nextAction, ssoEnabled) => {
  vi.mocked(requests.getInvitationSummary).mockResolvedValue({ ...summary, nextAction, ssoEnabled });
  mount();
  await screen.findByText('Target organization');
  expect(screen.queryByTestId('invitationSso')).not.toBeInTheDocument();
});
it('serializes SSO with password submission and rejects late SSO navigation after account change', async () => {
  vi.mocked(requests.getInvitationSummary).mockResolvedValue({ ...summary, ssoEnabled: true });
  const pending = deferred<{ samlRequest: string; ssoUrl: string }>();
  vi.mocked(requests.startInvitationSaml).mockReturnValue(pending.promise);
  const submitForm = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => undefined);
  const view = mount();
  await fillPassword();
  const button = screen.getByTestId('invitationSso');
  fireEvent.click(button);
  fireEvent.click(button);
  fireEvent.click(screen.getByTestId('invitationSubmit'));
  expect(requests.startInvitationSaml).toHaveBeenCalledOnce();
  expect(requests.acceptInvitation).not.toHaveBeenCalled();
  auth.loggedInUser = { id: 'other' };
  view.rerender(
    <StrictMode>
      <MemoryRouter>
        <InvitationAccess />
      </MemoryRouter>
    </StrictMode>,
  );
  await act(async () => {
    pending.resolve({ samlRequest: 'server-request', ssoUrl: 'https://idp.example' });
    await Promise.resolve();
  });
  expect(submitForm).not.toHaveBeenCalled();
  submitForm.mockRestore();
});
it('keeps password draft after controlled SSO failure and refreshes before a later attempt', async () => {
  vi.mocked(requests.getInvitationSummary)
    .mockResolvedValueOnce({ ...summary, ssoEnabled: true })
    .mockResolvedValueOnce({ ...summary, ssoEnabled: true, csrfToken: 'fresh-csrf' });
  vi.mocked(requests.startInvitationSaml).mockRejectedValue(new InvitationAccessError('unavailable'));
  mount();
  await fillPassword();
  fireEvent.click(screen.getByTestId('invitationSso'));
  expect(await screen.findByRole('alert')).toHaveTextContent('auth.invitation.errors.unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'auth.invitation.retry' }));
  expect(await screen.findByTestId('invitationPassword')).toHaveValue('Password1~');
  fireEvent.click(screen.getByTestId('invitationSso'));
  await waitFor(() => expect(requests.startInvitationSaml).toHaveBeenLastCalledWith('fresh-csrf', undefined));
});

function storeUser(id: string): string {
  const token = `header.${btoa(JSON.stringify({ id, exp: 4102444800, roles: [] }))}.sig`;
  expect(saveSession(token)).not.toBeNull();
  return token;
}
it.each(['account', 'workspace'])('ignores Joined after a stored %s change without a rerender', async (changed) => {
  const pending = deferred<InvitationJoined>();
  vi.mocked(requests.acceptInvitation).mockReturnValue(pending.promise);
  mount();
  await fillPassword();
  fireEvent.click(screen.getByTestId('invitationSubmit'));
  if (changed === 'account') storeUser('other-user');
  else saveContextOrganizationSlugInLS('other-workspace');
  await act(async () => {
    pending.resolve(joined);
    await pending.promise;
  });
  expect(auth.persistSession).not.toHaveBeenCalled();
  expect(auth.persistRefreshToken).not.toHaveBeenCalled();
  expect(workspace.checkIfContextOrganizationSlugIsInLocalStorage).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});
it.each(['exchange', 'summary'])('ignores a late initial %s after a stored workspace change', async (operation) => {
  const pending = deferred<InvitationSummary>();
  if (operation === 'exchange') {
    window.history.replaceState({}, '', '/invitations/accept#token=mail-secret');
    vi.mocked(requests.exchangeInvitation).mockReturnValue(pending.promise);
  } else vi.mocked(requests.getInvitationSummary).mockReturnValue(pending.promise);
  mount();
  saveContextOrganizationSlugInLS('other-workspace');
  await act(async () => {
    pending.resolve(summary);
    await pending.promise;
  });
  expect(screen.queryByText('Target organization')).not.toBeInTheDocument();
  expect(screen.queryByTestId('invitationSubmit')).not.toBeInTheDocument();
});
it.each(['accept', 'SSO'])(
  'does not start %s with the old bearer after storage changes before the click',
  async (operation) => {
    vi.mocked(requests.getInvitationSummary).mockResolvedValue({ ...summary, ssoEnabled: true });
    mount();
    await fillPassword();
    storeUser('other-user');
    fireEvent.click(screen.getByTestId(operation === 'accept' ? 'invitationSubmit' : 'invitationSso'));
    expect(requests.acceptInvitation).not.toHaveBeenCalled();
    expect(requests.startInvitationSaml).not.toHaveBeenCalled();
  },
);
it('rejects an initially stale provider instead of capturing a newer stored user as its baseline', () => {
  auth.loggedInUser = { id: 'old-user' };
  auth.session = { token: 'old-bearer' };
  storeUser('new-user');
  mount();
  expect(requests.getInvitationSummary).not.toHaveBeenCalled();
  expect(requests.exchangeInvitation).not.toHaveBeenCalled();
});
it('does not submit a late native SAML redirect after a stored user change', async () => {
  const pending = deferred<{ samlRequest: string; ssoUrl: string }>();
  vi.mocked(requests.getInvitationSummary).mockResolvedValue({ ...summary, ssoEnabled: true });
  vi.mocked(requests.startInvitationSaml).mockReturnValue(pending.promise);
  const submitForm = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => undefined);
  mount();
  fireEvent.click(await screen.findByTestId('invitationSso'));
  storeUser('other-user');
  await act(async () => {
    pending.resolve({ samlRequest: 'server-request', ssoUrl: 'https://idp.example' });
    await pending.promise;
  });
  expect(submitForm).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('epoca:sso-invitation-return')).toBeNull();
  submitForm.mockRestore();
});
it('ignores a conflict summary arriving after a stored workspace change', async () => {
  const pending = deferred<InvitationSummary>();
  vi.mocked(requests.acceptInvitation).mockRejectedValueOnce(new InvitationAccessError('revision-conflict'));
  vi.mocked(requests.getInvitationSummary).mockResolvedValueOnce(summary).mockReturnValueOnce(pending.promise);
  mount();
  await fillPassword();
  fireEvent.click(screen.getByTestId('invitationSubmit'));
  await waitFor(() => expect(requests.getInvitationSummary).toHaveBeenCalledTimes(2));
  saveContextOrganizationSlugInLS('other-workspace');
  await act(async () => {
    pending.resolve({ ...summary, roles: ['Manager'], revision: '2' });
    await pending.promise;
  });
  expect(screen.queryByText('Manager')).not.toBeInTheDocument();
  expect(auth.persistSession).not.toHaveBeenCalled();
});
it('allows the same stored user to refresh their token during acceptance', async () => {
  auth.loggedInUser = { id: 'same-user' };
  auth.session = { token: storeUser('same-user') };
  vi.mocked(requests.getInvitationSummary).mockResolvedValue({ ...summary, nextAction: 'Accept' });
  const pending = deferred<InvitationJoined>();
  vi.mocked(requests.acceptInvitation).mockReturnValue(pending.promise);
  mount();
  fireEvent.click(await screen.findByTestId('invitationSubmit'));
  const refreshed = `header.${btoa(JSON.stringify({ id: 'same-user', exp: 4102444801, roles: [] }))}.sig`;
  expect(saveSession(refreshed)).not.toBeNull();
  await act(async () => {
    pending.resolve(joined);
    await pending.promise;
  });
  expect(auth.persistSession).toHaveBeenCalledOnce();
  expect(navigate).toHaveBeenCalledOnce();
});
it('reports refresh persistence failure after its own successful Joined session write', async () => {
  auth.persistSession.mockImplementationOnce(() => {
    storeUser('joined-user');
  });
  auth.persistRefreshToken.mockImplementationOnce(() => {
    throw new Error('storage unavailable');
  });
  mount();
  await fillPassword();
  fireEvent.click(screen.getByTestId('invitationSubmit'));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/invitations/sign-in?joined=1', { replace: true }));
  expect(workspace.checkIfContextOrganizationSlugIsInLocalStorage).not.toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledOnce();
});

it('replaces initial workspace mismatch loading with actionable session recovery', async () => {
  auth.session = { token: 'current-jwt' };
  auth.loggedInUser = { id: 'user-1' };
  storeUser('user-1');
  workspace.contextOrganizationSlug = 'old-workspace';
  saveContextOrganizationSlugInLS('new-workspace');
  window.history.replaceState({}, '', '/invitations/accept#token=mail-secret');
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('auth.invitation.errors.session-changed');
  expect(screen.queryByText('auth.invitation.loading')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'auth.invitation.retry' })).not.toBeInTheDocument();
  expect(requests.exchangeInvitation).not.toHaveBeenCalled();
  expect(window.location.hash).toBe('');
});
