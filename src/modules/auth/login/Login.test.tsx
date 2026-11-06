import { paths } from '@/app/routing/paths';
import type { Session } from '@/core/models/session';
import { useSamlAuthCheckQuery } from '@/modules/ssoAuth';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock, MockedFunction } from 'vitest';
import { LoginSchema } from '../models/login.model';
import Login from './Login';

const mockNavigate = vi.fn();

const authState = {
  isAuthenticated: false,
  loading: false,
  login: vi.fn(),
  userChosenLanguage: 'en',
};
const addToastMock = vi.fn();

vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => authState }));
vi.mock('@/core/providers/toastProvider/ToastProvider', () => ({
  useToast: () => ({ addToast: addToastMock, removeToast: vi.fn(), toasts: [] }),
}));

vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => mockNavigate,
}));

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual('react-i18next')),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/modules/ssoAuth', async () => ({
  ...(await vi.importActual('@/modules/ssoAuth')),
  useSamlAuthCheckQuery: vi.fn(),
}));

vi.mock('@/core/utils/helpers', () => ({
  handleValidationErrors: vi.fn(() => ({})),
  parseUrlErrorParams: vi.fn(() => ({ errorCode: null, reason: null })),
}));

vi.mock('@/core/utils/hooks', () => ({
  useInitializeLanguage: vi.fn(),
  useTitle: vi.fn(),
}));

const useSamlAuthCheckQueryMock = useSamlAuthCheckQuery as MockedFunction<typeof useSamlAuthCheckQuery>;
const loginMock = vi.fn();
let helpersMocks: Record<string, Mock>;
beforeAll(async () => {
  helpersMocks = (await import('@/core/utils/helpers')) as unknown as Record<string, Mock>;
});

const auth = {
  token: 'access-token',
  user: {
    authedBy: [],
    exp: 4102444800,
    id: 'user-1',
    identities: [],
    isSuperAdmin: false,
    organizationGrants: [],
  },
} as Session;

const renderLogin = (samlAuthCheckQueryResult?: Record<string, unknown>, invitationReturn = false): void => {
  authState.login = loginMock;

  useSamlAuthCheckQueryMock.mockReturnValue(
    (samlAuthCheckQueryResult ?? {
      data: { samlRequest: '', ssoUrl: '' },
      isLoading: false,
      isError: false,
    }) as never,
  );

  render(<Login invitationReturn={invitationReturn} />);
};

const submitValidCredentials = async (): Promise<void> => {
  fireEvent.change(screen.getByTestId('loginEmailInput'), { target: { value: 'person@example.com' } });
  fireEvent.change(screen.getByTestId('loginPasswordInput'), { target: { value: 'Secret1!' } });
  await userEvent.click(screen.getByTestId('loginButton'));
};

describe('Login password visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    helpersMocks.handleValidationErrors.mockReturnValue({});
    helpersMocks.parseUrlErrorParams.mockReturnValue({ errorCode: null, reason: null });
  });

  it('masks the password by default and enables password manager autofill', () => {
    renderLogin();

    expect(screen.getByTestId('loginPasswordInput')).toHaveAttribute('type', 'password');
    expect(screen.getByTestId('loginPasswordInput')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByTestId('loginPasswordVisibilityButton')).toHaveAttribute(
      'aria-label',
      'auth.login.password.show',
    );
    expect(screen.getByTestId('loginPasswordVisibilityButton')).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles with a pointer and masks again when focus leaves the password control', async () => {
    const user = userEvent.setup();
    renderLogin();

    const passwordInput = screen.getByTestId('loginPasswordInput');
    const visibilityButton = screen.getByTestId('loginPasswordVisibilityButton');
    await user.click(visibilityButton);

    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(visibilityButton).toHaveAttribute('aria-label', 'auth.login.password.hide');
    expect(visibilityButton).toHaveAttribute('aria-pressed', 'true');

    await user.tab();

    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(visibilityButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles with keyboard activation while keeping the control in the tab order', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.tab();
    await user.tab();
    expect(screen.getByTestId('loginPasswordVisibilityButton')).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('loginPasswordInput')).toHaveAttribute('type', 'text');
    expect(screen.getByTestId('loginPasswordVisibilityButton')).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard(' ');

    expect(screen.getByTestId('loginPasswordInput')).toHaveAttribute('type', 'password');
  });
});

describe('Login navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    helpersMocks.handleValidationErrors.mockReturnValue({});
    helpersMocks.parseUrlErrorParams.mockReturnValue({ errorCode: null, reason: null });
  });

  it('stays on login when password authentication rejects', async () => {
    const failedLogin: Promise<Session | void> = Promise.reject(new Error('invalid credentials'));
    void failedLogin.catch(() => undefined);
    vi.spyOn(failedLogin, 'finally').mockImplementation((onFinally) => {
      onFinally?.();
      return Promise.resolve();
    });
    loginMock.mockReturnValue(failedLogin);
    renderLogin();

    await submitValidCredentials();

    await waitFor(() => expect(loginMock).toHaveBeenCalledTimes(1));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('navigates only after password authentication resolves', async () => {
    loginMock.mockResolvedValue(auth);
    renderLogin();

    await submitValidCredentials();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(paths.index));
  });

  it('sends the email trimmed and the password untouched', async () => {
    loginMock.mockResolvedValue(auth);
    renderLogin();

    fireEvent.change(screen.getByTestId('loginEmailInput'), { target: { value: '  person@example.com \t' } });
    fireEvent.change(screen.getByTestId('loginPasswordInput'), { target: { value: ' Secret1! ' } });
    await userEvent.click(screen.getByTestId('loginButton'));

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith('person@example.com', ' Secret1! '));
  });

  it('submits a password that does not match the sign-up strength rules', async () => {
    loginMock.mockResolvedValue(auth);
    renderLogin();

    fireEvent.change(screen.getByTestId('loginEmailInput'), { target: { value: 'person@example.com' } });
    fireEvent.change(screen.getByTestId('loginPasswordInput'), { target: { value: 'legacy_pass~word' } });
    await userEvent.click(screen.getByTestId('loginButton'));

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith('person@example.com', 'legacy_pass~word'));
    expect(helpersMocks.handleValidationErrors).not.toHaveBeenCalled();
  });
});

describe('Login SSO section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    helpersMocks.handleValidationErrors.mockReturnValue({});
    helpersMocks.parseUrlErrorParams.mockReturnValue({ errorCode: null, reason: null });
  });

  it('renders the workspace login button when the SAML auth check succeeds', () => {
    renderLogin({
      data: { samlRequest: 'request-1', ssoUrl: 'https://idp.example.com' },
      isLoading: false,
      isError: false,
    });

    expect(screen.getByTestId('workspaceLoginButton')).toBeInTheDocument();
    expect(screen.queryByTestId('ssoUnavailableText')).not.toBeInTheDocument();
  });

  it('renders an unavailable message instead of the button on a 4xx SAML auth check error', () => {
    const error = Object.assign(new Error('not found'), { isAxiosError: true, response: { status: 404 } });
    renderLogin({ data: undefined, isLoading: false, isError: true, error });

    expect(screen.getByTestId('ssoUnavailableText')).toHaveTextContent('auth.login.text.sso_unavailable');
    expect(screen.queryByTestId('workspaceLoginButton')).not.toBeInTheDocument();
  });

  it('hides the cached SSO form when a refetch fails', () => {
    const error = Object.assign(new Error('server error'), { isAxiosError: true, response: { status: 503 } });
    renderLogin({
      data: { samlRequest: 'stale-request', ssoUrl: 'https://idp.example.com' },
      isLoading: false,
      isError: true,
      error,
    });

    expect(screen.getByTestId('ssoUnavailableText')).toHaveTextContent('auth.login.text.sso_temporarily_unavailable');
    expect(screen.queryByTestId('workspaceLoginButton')).not.toBeInTheDocument();
  });

  it('renders an offline message while the first SAML auth check is paused', () => {
    renderLogin({ data: undefined, isLoading: false, isError: false, isPending: true, isPaused: true });

    expect(screen.getByTestId('ssoUnavailableText')).toHaveTextContent('auth.login.text.sso_offline');
    expect(screen.queryByTestId('workspaceLoginButton')).not.toBeInTheDocument();
  });

  it('keeps the cached SSO form when a background refetch is paused', () => {
    renderLogin({
      data: { samlRequest: 'request-1', ssoUrl: 'https://idp.example.com' },
      isLoading: false,
      isError: false,
      isPending: false,
      isPaused: true,
    });

    expect(screen.getByTestId('workspaceLoginButton')).toBeInTheDocument();
    expect(screen.queryByTestId('ssoUnavailableText')).not.toBeInTheDocument();
  });

  it('keeps the workspace login button after a rejected password login', async () => {
    loginMock.mockRejectedValue(new Error('invalid credentials'));
    renderLogin({
      data: { samlRequest: 'request-1', ssoUrl: 'https://idp.example.com' },
      isLoading: false,
      isError: false,
    });

    await submitValidCredentials();

    await waitFor(() => expect(loginMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('workspaceLoginButton')).toBeInTheDocument();
  });

  it('keeps the workspace login button when the login click fails validation', async () => {
    renderLogin({
      data: { samlRequest: 'request-1', ssoUrl: 'https://idp.example.com' },
      isLoading: false,
      isError: false,
    });

    fireEvent.change(screen.getByTestId('loginEmailInput'), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByTestId('loginPasswordInput'), { target: { value: 'Secret1!' } });
    await userEvent.click(screen.getByTestId('loginButton'));

    expect(loginMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('workspaceLoginButton')).toBeInTheDocument();
  });

  it('hides the SSO section only while the password login request is in flight', () => {
    authState.loading = true;
    try {
      renderLogin({
        data: { samlRequest: 'request-1', ssoUrl: 'https://idp.example.com' },
        isLoading: false,
        isError: false,
      });

      expect(screen.queryByTestId('workspaceLoginButton')).not.toBeInTheDocument();
      expect(screen.queryByTestId('ssoUnavailableText')).not.toBeInTheDocument();
    } finally {
      authState.loading = false;
    }
  });

  it('renders a temporarily-unavailable message on a 5xx SAML auth check error', () => {
    const error = Object.assign(new Error('server error'), { isAxiosError: true, response: { status: 500 } });
    renderLogin({ data: undefined, isLoading: false, isError: true, error });

    expect(screen.getByTestId('ssoUnavailableText')).toHaveTextContent('auth.login.text.sso_temporarily_unavailable');
    expect(screen.queryByTestId('workspaceLoginButton')).not.toBeInTheDocument();
  });
});

it('returns to the fixed invitation route after explicit invitation sign-in', async () => {
  loginMock.mockResolvedValue(auth);
  renderLogin(undefined, true);
  await submitValidCredentials();
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/invitations/accept'));
});

describe.each([false, true])('existing credential verification with invitationReturn=%s', (invitationReturn) => {
  beforeEach(() => {
    vi.clearAllMocks();
    helpersMocks.handleValidationErrors.mockReturnValue({});
    helpersMocks.parseUrlErrorParams.mockReturnValue({ errorCode: null, reason: null });
  });
  it('sends the backend-valid invitation password and navigates only after authentication', async () => {
    loginMock.mockResolvedValue(auth);
    renderLogin(undefined, invitationReturn);
    fireEvent.change(screen.getByTestId('loginEmailInput'), { target: { value: 'person@example.com' } });
    fireEvent.change(screen.getByTestId('loginPasswordInput'), { target: { value: 'Password1~' } });
    await userEvent.click(screen.getByTestId('loginButton'));
    expect(loginMock).toHaveBeenCalledWith('person@example.com', 'Password1~');
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(invitationReturn ? '/invitations/accept' : paths.index),
    );
  });
  it('leaves credential rejection to the server and does not navigate on failure', async () => {
    loginMock.mockRejectedValue(new Error('invalid credentials'));
    renderLogin(undefined, invitationReturn);
    fireEvent.change(screen.getByTestId('loginEmailInput'), { target: { value: 'person@example.com' } });
    fireEvent.change(screen.getByTestId('loginPasswordInput'), { target: { value: 'x' } });
    await userEvent.click(screen.getByTestId('loginButton'));
    expect(loginMock).toHaveBeenCalledWith('person@example.com', 'x');
    expect(mockNavigate).not.toHaveBeenCalled();
  });
  it('blocks an empty password and preserves email validation', () => {
    renderLogin(undefined, invitationReturn);
    fireEvent.change(screen.getByTestId('loginEmailInput'), { target: { value: 'person@example.com' } });
    expect(screen.getByTestId('loginButton')).toBeDisabled();
    expect(LoginSchema.safeParse({ email: 'person@example.com', password: '' }).success).toBe(false);
    expect(LoginSchema.safeParse({ email: 'invalid', password: 'Password1~' }).success).toBe(false);
    expect(loginMock).not.toHaveBeenCalled();
  });
});

it.each([true, false])(
  'records only explicit invitation return=%s when submitting ordinary SSO',
  (invitationReturn) => {
    sessionStorage.setItem('epoca:sso-invitation-return', 'stale');
    renderLogin(
      { data: { samlRequest: 'server-request', ssoUrl: 'https://idp.example/sso' }, isLoading: false, isError: false },
      invitationReturn,
    );
    // eslint-disable-next-line testing-library/no-node-access -- Assert the native SSO form submitted by this button.
    const form = screen.getByTestId('workspaceLoginButton').closest('form');
    expect(form).toHaveAttribute('action', 'https://idp.example/sso');
    fireEvent.submit(form!);
    expect(sessionStorage.getItem('epoca:sso-invitation-return')).toBe(invitationReturn ? '1' : null);
  },
);
