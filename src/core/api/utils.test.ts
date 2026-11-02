import { OrganizationUserRole } from '@/core/models/enums';
import { showToastForError } from '@/core/utils/helpers';
import axios, { AxiosError, CanceledError } from 'axios';
import {
  decodeSessionFromToken,
  handleConnectionError,
  isAccessTokenValid,
  isNetworkError,
  readStoredSession,
  saveSession,
} from './utils';

const encodeFakeJwt = (payload: Record<string, unknown>): string => {
  const base64Payload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_');
  return `header.${base64Payload}.signature`;
};

describe('decodeSessionFromToken', () => {
  it('decodes a well-formed token', () => {
    const token = encodeFakeJwt({ id: 'user-1', exp: 4102444800, roles: [] });
    const session = decodeSessionFromToken(token);
    expect(session?.user.id).toBe('user-1');
    expect(session?.token).toBe(token);
  });

  it('returns null for a token with no two dots, without throwing', () => {
    expect(() => decodeSessionFromToken('not-a-jwt')).not.toThrow();
    expect(decodeSessionFromToken('not-a-jwt')).toBeNull();
  });

  it('returns null without throwing for a non-string token (a malformed backend response reaching this at runtime despite the string type annotation)', () => {
    // AuthTokensSchema (modules/auth/models/authTokensDto.model.ts) validates that
    // accessToken/refreshToken are strings, but this function still needs to defend against a
    // caller that bypasses that boundary (e.g. a directly-constructed malformed value in a test
    // or a future call site), since the type annotation alone doesn't hold at runtime.
    for (const malformed of [null, undefined, 123, {}, []]) {
      expect(() => decodeSessionFromToken(malformed as string)).not.toThrow();
      expect(decodeSessionFromToken(malformed as string)).toBeNull();
    }
  });

  it('returns null for a token whose payload segment is not valid base64, without throwing', () => {
    expect(() => decodeSessionFromToken('header.!!!not-base64!!!.signature')).not.toThrow();
    expect(decodeSessionFromToken('header.!!!not-base64!!!.signature')).toBeNull();
  });

  it('returns null for a token whose decoded payload is not valid JSON, without throwing', () => {
    const badPayload = btoa('not json');
    expect(decodeSessionFromToken(`header.${badPayload}.signature`)).toBeNull();
  });

  it('returns null for a token missing the structural core (no exp), without throwing', () => {
    const token = encodeFakeJwt({ id: 'user-1' });
    expect(decodeSessionFromToken(token)).toBeNull();
  });
});

describe('saveSession', () => {
  afterEach(() => localStorage.clear());

  it('preserves per-organization role grants verbatim', () => {
    const token = encodeFakeJwt({
      id: 'user-1',
      exp: 4102444800,
      roles: [
        { organizationId: 'org-1', roles: [OrganizationUserRole.Owner] },
        { organizationId: 'org-2', roles: [OrganizationUserRole.Manager] },
      ],
    });

    const session = saveSession(token);
    if (!session) throw new Error('Expected a decoded session');

    expect(session.user.organizationGrants).toEqual([
      { organizationId: 'org-1', roles: [OrganizationUserRole.Owner] },
      { organizationId: 'org-2', roles: [OrganizationUserRole.Manager] },
    ]);
    expect(session.token).toBe(token);
  });

  it('tolerates an unrecognized role value, preserving it rather than rejecting the session', () => {
    const token = encodeFakeJwt({
      id: 'user-1',
      exp: 4102444800,
      roles: [{ organizationId: 'org-1', roles: ['SomeFutureRoleNotYetInFrontendEnum'] }],
    });

    const session = saveSession(token);
    if (!session) throw new Error('Expected a decoded session');

    expect(session.user.organizationGrants).toEqual([
      { organizationId: 'org-1', roles: ['SomeFutureRoleNotYetInFrontendEnum'] },
    ]);
  });

  it('never throws for a non-array roles value', () => {
    const token = encodeFakeJwt({ id: 'user-1', exp: 4102444800, roles: 'not-an-array' });
    expect(() => saveSession(token)).not.toThrow();
    const session = saveSession(token);
    if (!session) throw new Error('Expected a decoded session');
    expect(session.user.organizationGrants).toEqual([]);
  });

  it('returns null and persists nothing for a token that does not decode, instead of fabricating a session', () => {
    expect(() => saveSession('not-a-jwt')).not.toThrow();
    expect(saveSession('not-a-jwt')).toBeNull();
    expect(localStorage.getItem('IteratorsEpoca__auth__access_tok_localhost')).toBeNull();
  });
});

describe('readStoredSession', () => {
  afterEach(() => localStorage.removeItem('IteratorsEpoca__auth__access_tok_localhost'));

  it('returns absent when nothing is stored', () => {
    expect(readStoredSession()).toEqual({ status: 'absent' });
  });

  it('returns unreadable/invalid-json for a corrupt (non-JSON) stored blob, without throwing', () => {
    localStorage.setItem('IteratorsEpoca__auth__access_tok_localhost', 'not json at all');
    expect(() => readStoredSession()).not.toThrow();
    expect(readStoredSession()).toEqual({ status: 'unreadable', reason: 'invalid-json' });
  });

  it('returns unreadable/invalid-shape for valid JSON that is not shaped like a session, without throwing', () => {
    localStorage.setItem('IteratorsEpoca__auth__access_tok_localhost', '{}');
    expect(() => readStoredSession()).not.toThrow();
    expect(readStoredSession()).toEqual({ status: 'unreadable', reason: 'invalid-shape' });
  });

  it('returns valid for a well-formed stored session', () => {
    // Shaped as organizationGrants (not roles) deliberately -- this is what a real browser's
    // localStorage actually contains, since saveSession only ever persists its own transformed
    // output, never the raw JWT wire shape. A non-empty grant here means this test would catch a
    // regression that wipes organizationGrants on re-parse (see sessionSchema.ts/its own test for
    // the full regression this pins), which an empty-array fixture could not.
    const stored = {
      token: 't',
      user: { id: 'u', exp: 4102444800, organizationGrants: [{ organizationId: 'org-1', roles: ['Owner'] }] },
    };
    localStorage.setItem('IteratorsEpoca__auth__access_tok_localhost', JSON.stringify(stored));
    const result = readStoredSession();
    if (result.status !== 'valid') throw new Error(`expected a valid session, got status: ${result.status}`);
    expect(result.session.user.id).toBe('u');
    expect(result.session.user.organizationGrants).toEqual([{ organizationId: 'org-1', roles: ['Owner'] }]);
  });

  it('recovers from a valid token by re-deriving from it, even if the stored user cache is malformed', () => {
    const token = encodeFakeJwt({ id: 'u', exp: 4102444800, roles: [] });
    localStorage.setItem(
      'IteratorsEpoca__auth__access_tok_localhost',
      JSON.stringify({ token, user: 'not-an-object-at-all' }),
    );
    const result = readStoredSession();
    if (result.status !== 'valid') throw new Error(`expected a valid session, got status: ${result.status}`);
    expect(result.session.user.id).toBe('u');
  });

  it('does not attempt recovery when the stored blob has no token to recover from', () => {
    localStorage.setItem(
      'IteratorsEpoca__auth__access_tok_localhost',
      JSON.stringify({ user: { id: 'u', exp: 4102444800 } }),
    );
    expect(() => readStoredSession()).not.toThrow();
    expect(readStoredSession()).toEqual({ status: 'unreadable', reason: 'invalid-shape' });
  });

  // Bootstrap-crash regression fixtures named explicitly in the design doc
  // (docs/specs/2026-09-08-ct-544-session-permission-redesign-design.md) -- each must be handled
  // without throwing, whatever the resulting status.
  it.each([
    ['a JSON object with only a non-JWT token string', '{"token":"t"}'],
    ['a JSON array', '[]'],
    ['the JSON literal null', 'null'],
  ])('never throws for %s', (_description, storedValue) => {
    localStorage.setItem('IteratorsEpoca__auth__access_tok_localhost', storedValue);
    expect(() => readStoredSession()).not.toThrow();
    expect(readStoredSession().status).toBe('unreadable');
  });
});

describe('isAccessTokenValid', () => {
  it('returns false for null', () => {
    expect(isAccessTokenValid(null)).toBe(false);
  });

  it('returns true for a session expiring in the future', () => {
    const session = {
      token: 't',
      user: { id: 'u', exp: 4102444800, organizationGrants: [], identities: [], authedBy: [], isSuperAdmin: false },
    };
    expect(isAccessTokenValid(session)).toBe(true);
  });

  it('returns false for a session that already expired', () => {
    const session = {
      token: 't',
      user: { id: 'u', exp: 1, organizationGrants: [], identities: [], authedBy: [], isSuperAdmin: false },
    };
    expect(isAccessTokenValid(session)).toBe(false);
  });
});

vi.mock('@/core/utils/helpers/show-toasts-for-error', () => ({ showToastForError: vi.fn() }));

describe('connection errors', () => {
  beforeEach(() => vi.mocked(showToastForError).mockClear());

  it('does not classify an Axios cancellation as a network failure or show a connection toast', () => {
    const error = new CanceledError('canceled');
    expect(isNetworkError(error)).toBe(false);
    handleConnectionError(error);
    expect(showToastForError).not.toHaveBeenCalled();
  });

  it('keeps an AbortSignal cancellation silent using the actual Axios rejection', async () => {
    const controller = new AbortController();
    controller.abort();
    const error: unknown = await axios
      .get('/canceled-before-dispatch', { signal: controller.signal })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CanceledError);
    handleConnectionError(error);
    expect(showToastForError).not.toHaveBeenCalled();
  });

  it.each([
    new AxiosError('Network Error', 'ERR_NETWORK'),
    new AxiosError('timeout of 1000ms exceeded', 'ECONNABORTED'),
    new AxiosError('Connection lost'),
  ])('still reports a genuine connection failure: $message', (error) => {
    expect(isNetworkError(error)).toBe(true);
    handleConnectionError(error);
    expect(showToastForError).toHaveBeenCalledWith(expect.objectContaining({ error }));
  });
});
