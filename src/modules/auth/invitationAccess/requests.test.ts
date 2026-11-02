import api from '@/core/api';
import { setRefreshAccessTokenHandler } from '@/core/api/tokenRefresh';
import * as apiUtils from '@/core/api/utils';
import { saveRefreshToken, saveSession } from '@/core/api/utils';
import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { InvitationPasswordSchema, InvitationSummarySchema } from '../models/invitationAccess.model';
import { InvitationAccessError } from './problem';
import * as requests from './requests';
import { acceptInvitation, exchangeInvitation, getInvitationSummary } from './requests';

const { adapter } = vi.hoisted(() => ({
  adapter: vi.fn<(config: InternalAxiosRequestConfig<string>) => Promise<AxiosResponse<unknown, string>>>(),
}));
vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');
  return {
    ...actual,
    default: { ...actual.default, create: (config: object) => actual.default.create({ ...config, adapter }) },
  };
});
const summary = {
  organization: { name: 'Target', slug: 'target' },
  email: 'a@example.com',
  firstName: null,
  lastName: null,
  roles: ['Employee'],
  revision: '2',
  expiresAt: '2026-12-01T00:00:00Z',
  csrfToken: 'csrf-secret',
  nextAction: 'CreateAccount',
  ssoEnabled: false,
};
const bearer = `header.${btoa(JSON.stringify({ id: 'recipient', exp: 4102444800, roles: [] }))}.sig`;
beforeEach(() => {
  localStorage.clear();
  adapter.mockReset();
  adapter.mockResolvedValue({
    data: summary,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as InternalAxiosRequestConfig<string>,
  });
});
it('validates server summaries and strips additional fields', () => {
  expect(InvitationSummarySchema.parse({ ...summary, password: 'secret' })).toEqual(summary);
  expect(InvitationSummarySchema.safeParse({ ...summary, revision: 2 }).success).toBe(false);
});
it('accepts Unicode and arbitrary special characters while enforcing confirmation and creation policy', () => {
  expect(InvitationPasswordSchema.safeParse({ password: 'Ąbćdef1~', confirmation: 'Ąbćdef1~' }).success).toBe(true);
  for (const password of ['short1!', 'abcdefgh1!', 'ABCDEFGH1!', 'Abcdefgh!', 'Abcdefgh1', 'A'.repeat(65)]) {
    expect(InvitationPasswordSchema.safeParse({ password, confirmation: password }).success).toBe(false);
  }
  expect(InvitationPasswordSchema.safeParse({ password: 'Abcdefg1!', confirmation: 'different' }).success).toBe(false);
});
it('uses the shared API with cookies and an explicit bearer', async () => {
  const post = vi.spyOn(api, 'post');
  await exchangeInvitation('mail-secret', bearer);
  expect(post).toHaveBeenCalledWith(
    '/invitation-access/exchange',
    { token: 'mail-secret' },
    expect.objectContaining({
      authPolicy: { mode: 'explicit', token: bearer },
    }),
  );
  post.mockRestore();
  const config = adapter.mock.calls[0][0];
  expect(config.withCredentials).toBe(true);
  expect(config.headers.get('Authorization')).toBe(`Bearer ${bearer}`);
  expect(JSON.parse(config.data ?? '')).toEqual({ token: 'mail-secret' });
  await getInvitationSummary();
  expect(adapter.mock.calls[1][0].headers.get('Authorization')).toBeUndefined();
});
it('omits an expired bearer so a new invitation context survives subsequent sign-in', async () => {
  const expired = `header.${btoa(JSON.stringify({ id: 'recipient', exp: 1, roles: [] }))}.sig`;
  await exchangeInvitation('mail-secret', expired);
  const config = adapter.mock.calls[0][0];
  expect(config.headers.get('Authorization')).toBeUndefined();
  expect(config.withCredentials).toBe(true);
  expect(JSON.parse(config.data ?? '')).toEqual({ token: 'mail-secret' });
});
it('sends csrf and decimal expectedRevision on acceptance', async () => {
  adapter.mockResolvedValueOnce({
    data: { organizationSlug: 'target', accessToken: 'jwt', refreshToken: 'refresh', extra: 'strip' },
    status: 200,
    statusText: 'OK',
    config: {} as InternalAxiosRequestConfig<string>,
    headers: {},
  });
  expect(await acceptInvitation(summary, bearer, 'Password1~')).toEqual({
    organizationSlug: 'target',
    accessToken: 'jwt',
    refreshToken: 'refresh',
  });
  expect(adapter.mock.calls[0][0].url).toBe('/invitation-access/password');
  expect(adapter.mock.calls[0][0].headers.get('X-CSRF-Token')).toBe('csrf-secret');
  expect(JSON.parse(adapter.mock.calls[0][0].data ?? '')).toEqual({ expectedRevision: '2', password: 'Password1~' });
});
it('keeps only known problem codes and bounded retry seconds, never raw wire errors', async () => {
  adapter.mockRejectedValueOnce(
    new axios.AxiosError('password-secret', undefined, undefined, undefined, {
      status: 429,
      data: { type: 'result:invitation:rate-limited', secret: 'mail-secret' },
      headers: { 'retry-after': '99999' },
    } as never),
  );
  await expect(getInvitationSummary()).rejects.toEqual(new InvitationAccessError('rate-limited', 300));
  adapter.mockRejectedValueOnce(new Error('password-secret'));
  await expect(getInvitationSummary()).rejects.toEqual(new InvitationAccessError('unavailable'));
});
it('recognizes only the committed session-issue failure shape', async () => {
  adapter.mockRejectedValueOnce(
    new axios.AxiosError('raw', undefined, undefined, undefined, {
      status: 503,
      data: { type: 'result:invitation:session-issue-failed', joined: true },
      headers: {},
    } as never),
  );
  await expect(acceptInvitation(summary)).rejects.toEqual(new InvitationAccessError('session-issue-failed'));
});

it('allows server-valid non-decimal number and control special characters', () => {
  for (const password of ['Abcdef1²', 'Abcdef1\t'])
    expect(InvitationPasswordSchema.safeParse({ password, confirmation: password }).success).toBe(true);
});

it('accepts Unicode lowercase letters outside the Ll category supported by the backend', () => {
  const password = 'Aª12345!';
  expect(InvitationPasswordSchema.safeParse({ password, confirmation: password }).success).toBe(true);
});

it('starts target SSO using only cookie, raw bearer and summary CSRF with no JSON body or target argument', async () => {
  adapter.mockResolvedValueOnce({
    data: { samlRequest: 'server-request', ssoUrl: 'https://target-idp.example/sso', csrfToken: 'strip' },
    status: 201,
    statusText: 'Created',
    config: {} as InternalAxiosRequestConfig<string>,
    headers: {},
  });
  expect(await requests.startInvitationSaml(summary.csrfToken, bearer)).toEqual({
    samlRequest: 'server-request',
    ssoUrl: 'https://target-idp.example/sso',
  });
  const config = adapter.mock.calls[0][0];
  expect(config.url).toBe('/invitation-access/saml');
  expect(config.method).toBe('post');
  expect(config.withCredentials).toBe(true);
  expect(config.data).toBeUndefined();
  expect(config.headers.get('Authorization')).toBe(`Bearer ${bearer}`);
  expect(config.headers.get('X-CSRF-Token')).toBe('csrf-secret');
  expect(config.headers.has('Origin')).toBe(false); // Browser supplies its real Origin; do not forge it in JavaScript.
});
it.each([
  { samlRequest: '', ssoUrl: 'https://idp.example' },
  // eslint-disable-next-line no-script-url -- Regression fixture: reject an executable redirect destination.
  { samlRequest: 'request', ssoUrl: 'javascript:alert(1)' },
])('rejects unusable target SSO response %j with controlled error', async (data) => {
  adapter.mockResolvedValueOnce({
    data,
    status: 201,
    statusText: 'Created',
    config: {} as InternalAxiosRequestConfig<string>,
    headers: {},
  });
  await expect(requests.startInvitationSaml('csrf-secret')).rejects.toEqual(new InvitationAccessError('unavailable'));
});

it.each([4102444800, 1])('never switches to a stored account or refreshes it (stored expiry %s)', async (exp) => {
  const storedBearer = `header.${btoa(JSON.stringify({ id: 'different-account', exp, roles: [] }))}.sig`;
  saveSession(storedBearer);
  saveRefreshToken('stored-refresh-secret');
  await exchangeInvitation('mail-secret', bearer);
  await getInvitationSummary();
  expect(adapter).toHaveBeenCalledTimes(2);
  expect(adapter.mock.calls[0][0].headers.get('Authorization')).toBe(`Bearer ${bearer}`);
  expect(adapter.mock.calls[1][0].headers.get('Authorization')).toBeUndefined();
  expect(adapter.mock.calls.map(([config]) => config.url)).toEqual([
    '/invitation-access/exchange',
    '/invitation-access',
  ]);
});

it('does not report or expose a raw credential failure outside the request boundary', async () => {
  adapter.mockImplementationOnce((config) => {
    return Promise.reject(
      new axios.AxiosError('password-secret', undefined, config, undefined, {
        status: 500,
        statusText: 'Internal Server Error',
        data: { type: 'unexpected', password: 'Password1~', token: 'mail-secret' },
        config,
        headers: {},
      }),
    );
  });
  const failure: unknown = await acceptInvitation(summary, bearer, 'Password1~').catch((error: unknown) => error);
  expect(failure).toEqual(new InvitationAccessError('unavailable'));
  expect(failure).not.toHaveProperty('config');
  expect(failure).not.toHaveProperty('response');
  expect(failure).not.toHaveProperty('cause');
  expect(JSON.stringify(failure)).not.toMatch(/Password1~|mail-secret|password-secret/);
  expect(adapter).toHaveBeenCalledOnce();
});

it.each([
  { status: 503, joined: false },
  { status: 503, joined: 'true' },
  { status: 400, joined: true },
])('does not claim committed membership for an unconfirmed failure %j', async ({ status, joined }) => {
  adapter.mockImplementationOnce((config) => {
    return Promise.reject(
      new axios.AxiosError('raw', undefined, config, undefined, {
        status,
        statusText: 'Error',
        data: { type: 'result:invitation:session-issue-failed', joined },
        config,
        headers: {},
      }),
    );
  });
  await expect(acceptInvitation(summary)).rejects.toEqual(new InvitationAccessError('unavailable'));
});

it('finishes explicit invitation requests while an ordinary request waits for session refresh', async () => {
  const expired = `header.${btoa(JSON.stringify({ id: 'stored-account', exp: 1, roles: [] }))}.sig`;
  saveSession(expired);
  saveRefreshToken('stored-refresh');
  const pending = Promise.withResolvers<string>();
  const refresh = vi.fn(() => pending.promise);
  const unregister = setRefreshAccessTokenHandler(refresh);
  try {
    const ordinary = api.get('/work-units');
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledExactlyOnceWith('stored-refresh'));
    await getInvitationSummary(bearer);
    expect(adapter).toHaveBeenCalledOnce();
    expect(adapter.mock.calls[0][0].url).toBe('/invitation-access');
    expect(adapter.mock.calls[0][0].headers.get('Authorization')).toBe(`Bearer ${bearer}`);
    pending.resolve('refreshed-stored-token');
    await ordinary;
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(adapter.mock.calls[1][0].url).toBe('/work-units');
    expect(adapter.mock.calls[1][0].headers.get('Authorization')).toBe('Bearer refreshed-stored-token');
  } finally {
    pending.resolve('refreshed-stored-token');
    unregister();
  }
});

it('leaves invitation network errors to the feature without a second global toast', async () => {
  const handleConnectionError = vi.spyOn(apiUtils, 'handleConnectionError');
  try {
    adapter.mockImplementationOnce((config) =>
      Promise.reject(new axios.AxiosError('Network Error', axios.AxiosError.ERR_NETWORK, config)),
    );
    await expect(getInvitationSummary()).rejects.toEqual(new InvitationAccessError('unavailable'));
    expect(handleConnectionError).not.toHaveBeenCalled();
    expect(adapter).toHaveBeenCalledOnce();
  } finally {
    handleConnectionError.mockRestore();
  }
});

it('reads a bounded retry delay from a canonical Retry-After header', async () => {
  adapter.mockRejectedValueOnce(
    new axios.AxiosError('raw', undefined, undefined, undefined, {
      status: 429,
      data: { type: 'result:invitation:rate-limited' },
      headers: { 'Retry-After': '99999' },
    } as never),
  );
  await expect(getInvitationSummary()).rejects.toEqual(new InvitationAccessError('rate-limited', 300));
});
