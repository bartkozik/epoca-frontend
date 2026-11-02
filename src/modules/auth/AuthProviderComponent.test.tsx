import { queryClient } from '@/core/api/queryClient';
import { AuthProvider, useAuth } from '@/modules/auth/AuthProvider';
import { OrganizationUserRole } from '@/modules/organizations/types';
import type { ReactNode } from 'react';
import type { AxiosResponse } from 'axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import * as requests from './requests';

const { saveSessionMock, saveRefreshTokenMock, readStoredSessionMock, removeCredentialsMock, removeRefreshMock } =
  vi.hoisted(() => ({
    saveSessionMock: vi.fn(),
    saveRefreshTokenMock: vi.fn(),
    readStoredSessionMock: vi.fn(),
    removeCredentialsMock: vi.fn(),
    removeRefreshMock: vi.fn(),
  }));

vi.mock('@/core/api', () => ({
  getDeviceId: () => 'device-1',
  getRefreshToken: () => 'refresh-token',
  readStoredSession: readStoredSessionMock,
  removeAPICredentials: removeCredentialsMock,
  removeRefreshToken: removeRefreshMock,
  saveRefreshToken: saveRefreshTokenMock,
  saveSession: saveSessionMock,
}));
vi.mock('@/core/api/queryClient', () => ({ queryClient: { clear: vi.fn() } }));
vi.mock('@/core/utils/helpers', () => ({
  getUserMailFromIdentity: () => 'ada@example.com',
  showToastForError: vi.fn(),
}));
vi.mock('@/modules/organizations/utils', () => ({
  getContextOrganizationIdFromLS: () => 'org-1',
  removeContextOrganizationIdFromLS: vi.fn(),
  removeContextOrganizationSlugFromLS: vi.fn(),
}));
vi.mock('./requests', () => ({
  invalidateRefreshToken: vi.fn(),
  login: vi.fn(),
  loginWithRefreshToken: vi.fn(),
}));

const userSession = {
  token: 'access-token',
  user: { id: 'user-1', exp: 4102444800, identities: [], isSuperAdmin: false, organizationGrants: [] },
};
const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    <AuthProvider>{children}</AuthProvider>
  </QueryClientProvider>
);
const loginWithRefreshTokenMock = vi.mocked(requests.loginWithRefreshToken);
const invalidateRefreshTokenMock = vi.mocked(requests.invalidateRefreshToken);

beforeEach(() => {
  vi.clearAllMocks();
  readStoredSessionMock.mockReturnValue({ status: 'absent' });
  saveSessionMock.mockReturnValue(userSession);
  saveRefreshTokenMock.mockImplementation((token: string) => token);
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('AuthProvider session lifecycle', () => {
  it('clears local credentials immediately and coalesces concurrent logout while remote invalidation is pending', async () => {
    const invalidation = deferred<AxiosResponse>();
    invalidateRefreshTokenMock.mockReturnValue(invalidation.promise);
    readStoredSessionMock.mockReturnValue({ status: 'valid', session: userSession });
    const { result } = renderHook(useAuth, { wrapper });

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.logout();
      second = result.current.logout();
    });

    expect(first).toBe(second);
    expect(result.current.isAuthenticated).toBe(false);
    expect(removeCredentialsMock).toHaveBeenCalledOnce();
    expect(removeRefreshMock).toHaveBeenCalledOnce();
    expect(invalidateRefreshTokenMock).toHaveBeenCalledOnce();
    invalidation.resolve({} as AxiosResponse);
    await act(async () => first);
    expect(result.current.isLogoutInProgress).toBe(false);
  });

  it('does not restore the session when a refresh response arrives after logout', async () => {
    const refresh = deferred<{ accessToken: string; refreshToken: string }>();
    const invalidation = deferred<AxiosResponse>();
    loginWithRefreshTokenMock.mockReturnValue(refresh.promise);
    invalidateRefreshTokenMock.mockReturnValue(invalidation.promise);
    readStoredSessionMock.mockReturnValue({ status: 'valid', session: userSession });
    const { result } = renderHook(useAuth, { wrapper });

    let refreshRequest!: Promise<string>;
    act(() => {
      refreshRequest = result.current.refreshAfterPermissionGrant().then(() => 'unexpected');
    });
    await waitFor(() => expect(loginWithRefreshTokenMock).toHaveBeenCalledOnce());
    let logout!: Promise<void>;
    act(() => {
      logout = result.current.logout();
    });
    refresh.resolve({ accessToken: 'late-access-token', refreshToken: 'late-refresh-token' });
    await expect(refreshRequest).rejects.toThrow('Session ended during token refresh');
    invalidation.resolve({} as AxiosResponse);
    await act(async () => logout);

    expect(result.current.isAuthenticated).toBe(false);
    expect(saveSessionMock).not.toHaveBeenCalled();
    expect(saveRefreshTokenMock).not.toHaveBeenCalled();
  });

  it('persists refreshed access and refresh tokens after a successful refresh', async () => {
    const refresh = deferred<{ accessToken: string; refreshToken: string }>();
    loginWithRefreshTokenMock.mockReturnValue(refresh.promise);
    const { result } = renderHook(useAuth, { wrapper });

    let request!: Promise<void>;
    act(() => {
      request = result.current.refreshAfterPermissionGrant();
    });
    await waitFor(() => expect(loginWithRefreshTokenMock).toHaveBeenCalledOnce());
    refresh.resolve({ accessToken: 'fresh-access', refreshToken: 'fresh-refresh' });
    await act(async () => request);

    expect(loginWithRefreshTokenMock).toHaveBeenCalledWith('refresh-token');
    expect(saveSessionMock).toHaveBeenCalledOnce();
    expect(saveSessionMock).toHaveBeenCalledWith('fresh-access');
    expect(saveRefreshTokenMock).toHaveBeenCalledOnce();
    expect(saveRefreshTokenMock).toHaveBeenCalledWith('fresh-refresh');
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('clears the session when refresh fails', async () => {
    loginWithRefreshTokenMock.mockRejectedValueOnce(new Error('refresh rejected'));
    readStoredSessionMock.mockReturnValue({ status: 'valid', session: userSession });
    const { result } = renderHook(useAuth, { wrapper });

    await act(async () => {
      await expect(result.current.refreshAfterPermissionGrant()).rejects.toThrow('refresh rejected');
    });

    expect(removeCredentialsMock).toHaveBeenCalledOnce();
    expect(removeRefreshMock).toHaveBeenCalledOnce();
    expect(queryClient.clear).toHaveBeenCalledOnce();
  });

  it('rejects a token that cannot be decoded and remains unauthenticated', () => {
    saveSessionMock.mockReturnValueOnce(null);
    const { result } = renderHook(useAuth, { wrapper });

    expect(() => result.current.persistSession('malformed-token')).toThrow(
      'The server returned a session that could not be read.',
    );
    expect(result.current.isAuthenticated).toBe(false);
    expect(saveRefreshTokenMock).not.toHaveBeenCalled();
  });

  it('checks roles against the requested organization and the persisted active organization', () => {
    const scopedSession = {
      ...userSession,
      user: {
        ...userSession.user,
        organizationGrants: [
          { organizationId: 'org-1', roles: [OrganizationUserRole.Owner] },
          { organizationId: 'org-2', roles: [OrganizationUserRole.Employee] },
        ],
      },
    };
    readStoredSessionMock.mockReturnValue({ status: 'valid', session: scopedSession });
    const { result } = renderHook(useAuth, { wrapper });

    expect(result.current.hasAccessInOrganization('org-1', [OrganizationUserRole.Owner])).toBe(true);
    expect(result.current.hasAccessInOrganization('org-1', [OrganizationUserRole.Employee])).toBe(false);
    expect(result.current.hasAccessInOrganization('org-2', [OrganizationUserRole.Employee])).toBe(true);
    expect(result.current.hasAccess([OrganizationUserRole.Owner])).toBe(true);
  });
});

it('clears the prior account query cache and workspace when persisting a different user', () => {
  readStoredSessionMock.mockReturnValue({ status: 'valid', session: userSession });
  const { result } = renderHook(useAuth, { wrapper });
  saveSessionMock.mockReturnValue({ ...userSession, user: { ...userSession.user, id: 'user-2' } });
  act(() => {
    result.current.persistSession('other-user-jwt');
  });
  expect(queryClient.clear).toHaveBeenCalledOnce();
});
it('keeps same-account cache intact when replacing an access token', () => {
  readStoredSessionMock.mockReturnValue({ status: 'valid', session: userSession });
  const { result } = renderHook(useAuth, { wrapper });
  act(() => {
    result.current.persistSession('same-user-jwt');
  });
  expect(queryClient.clear).not.toHaveBeenCalled();
});
