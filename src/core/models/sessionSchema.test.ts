import { sessionSchema } from './sessionSchema';

describe('sessionSchema', () => {
  it('rejects an empty object', () => {
    expect(sessionSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a session missing exp', () => {
    const result = sessionSchema.safeParse({ token: 't', user: { id: 'u' } });
    expect(result.success).toBe(false);
  });

  it('accepts a minimal valid session with no roles', () => {
    const result = sessionSchema.safeParse({ token: 't', user: { id: 'u', exp: 123 } });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    expect(result.data.user.organizationGrants).toEqual([]);
  });

  it('tolerates roles being a non-array value entirely', () => {
    const result = sessionSchema.safeParse({ token: 't', user: { id: 'u', exp: 123, roles: 'not-an-array' } });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    expect(result.data.user.organizationGrants).toEqual([]);
  });

  it('preserves an unrecognized future role value verbatim', () => {
    const result = sessionSchema.safeParse({
      token: 't',
      user: { id: 'u', exp: 123, roles: [{ organizationId: 'o1', roles: ['Owner', 'FutureRole'] }] },
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    expect(result.data.user.organizationGrants).toEqual([{ organizationId: 'o1', roles: ['Owner', 'FutureRole'] }]);
  });

  it('drops one malformed organization-grant entry without dropping its valid siblings', () => {
    const result = sessionSchema.safeParse({
      token: 't',
      user: { id: 'u', exp: 123, roles: [{ organizationId: 'o2' }, 'garbage'] },
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    expect(result.data.user.organizationGrants).toEqual([{ organizationId: 'o2', roles: [] }]);
  });

  it('drops one malformed role value inside a grant without dropping its valid siblings', () => {
    const result = sessionSchema.safeParse({
      token: 't',
      user: { id: 'u', exp: 123, roles: [{ organizationId: 'o4', roles: ['Owner', 123] }] },
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    expect(result.data.user.organizationGrants).toEqual([{ organizationId: 'o4', roles: ['Owner'] }]);
  });

  it('preserves an unrecognized identity type verbatim', () => {
    const result = sessionSchema.safeParse({
      token: 't',
      user: {
        id: 'u',
        exp: 123,
        identities: [{ type: 'Saml', id: 'i1', value: null, deviceId: null, main: true }],
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    expect(result.data.user.identities).toEqual([{ type: 'Saml', id: 'i1', value: null, deviceId: null, main: true }]);
  });

  it('defaults isSuperAdmin to false when missing or malformed', () => {
    const result = sessionSchema.safeParse({ token: 't', user: { id: 'u', exp: 123, isSuperAdmin: 'nope' } });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    expect(result.data.user.isSuperAdmin).toBe(false);
  });

  it('parses an existing pre-redesign stored blob (contextRoles present) without rejecting, ignoring contextRoles', () => {
    const legacyBlob = {
      token: 't',
      user: {
        id: 'u',
        exp: 123,
        isSuperAdmin: false,
        identities: [],
        authedBy: [],
        roles: [{ organizationId: 'o1', roles: ['Owner'] }],
        contextRoles: ['Owner'],
      },
    };
    const result = sessionSchema.safeParse(legacyBlob);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    expect(result.data.user.organizationGrants).toEqual([{ organizationId: 'o1', roles: ['Owner'] }]);
    expect(result.data.user).toHaveProperty('contextRoles', ['Owner']);
  });

  it('parses a legacy blob whose roles is null', () => {
    const result = sessionSchema.safeParse({ token: 't', user: { id: 'u', exp: 123, roles: null, contextRoles: [] } });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    expect(result.data.user.organizationGrants).toEqual([]);
  });

  it('a future top-level field on the session itself survives via the outer .passthrough()', () => {
    const result = sessionSchema.safeParse({ token: 't', user: { id: 'u', exp: 123 }, futureField: 'x' });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    expect(result.data).toHaveProperty('futureField', 'x');
  });

  it('round-trips its own persisted output without losing organizationGrants (regression: readStoredSession re-parses what saveSession already transformed)', () => {
    const firstParse = sessionSchema.safeParse({
      token: 't',
      user: { id: 'u', exp: 123, roles: [{ organizationId: 'org-1', roles: ['Owner'] }] },
    });
    if (!firstParse.success) throw new Error('unreachable');
    expect(firstParse.data.user.organizationGrants).toEqual([{ organizationId: 'org-1', roles: ['Owner'] }]);

    const roundTripped: unknown = JSON.parse(JSON.stringify(firstParse.data));
    const secondParse = sessionSchema.safeParse(roundTripped);
    if (!secondParse.success) throw new Error('unreachable');
    expect(secondParse.data.user.organizationGrants).toEqual([{ organizationId: 'org-1', roles: ['Owner'] }]);
  });

  it('prefers organizationGrants over roles when both are present, even with different data', () => {
    const result = sessionSchema.safeParse({
      token: 't',
      user: {
        id: 'u',
        exp: 123,
        roles: [{ organizationId: 'org-stale', roles: ['Employee'] }],
        organizationGrants: [{ organizationId: 'org-fresh', roles: ['Owner'] }],
      },
    });
    if (!result.success) throw new Error('unreachable');
    expect(result.data.user.organizationGrants).toEqual([{ organizationId: 'org-fresh', roles: ['Owner'] }]);
  });

  it('denies (does not fall back to roles) when organizationGrants is present but malformed', () => {
    const result = sessionSchema.safeParse({
      token: 't',
      user: {
        id: 'u',
        exp: 123,
        roles: [{ organizationId: 'org-1', roles: ['Owner'] }],
        organizationGrants: 'not-an-array',
      },
    });
    if (!result.success) throw new Error('unreachable');
    expect(result.data.user.organizationGrants).toEqual([]);
  });

  it('drops one malformed authedBy entry without dropping its valid siblings', () => {
    const result = sessionSchema.safeParse({
      token: 't',
      user: {
        id: 'u',
        exp: 123,
        authedBy: [{ type: 'MailAddress', id: null }, 'garbage', { type: 123 }],
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    expect(result.data.user.authedBy).toEqual([{ type: 'MailAddress', id: null }]);
  });
});
