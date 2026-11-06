import api from '@/core/api/Api';
import type { MockedFunction } from 'vitest';
import { normalizeIntegrationClientProblem } from './problem';
import {
  createIntegrationClient,
  getIntegrationClient,
  listIntegrationClientAuditEvents,
  listIntegrationClients,
  revokeIntegrationClient,
  rotateIntegrationClientSecret,
  updateIntegrationClient,
} from './requests';

vi.mock('@/core/api/Api', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

// eslint-disable-next-line vitest/unbound-method
const getMock = api.get as MockedFunction<typeof api.get>;
// eslint-disable-next-line vitest/unbound-method
const postMock = api.post as MockedFunction<typeof api.post>;
// eslint-disable-next-line vitest/unbound-method
const patchMock = api.patch as MockedFunction<typeof api.patch>;

const actor = {
  userId: '33333333-3333-4333-8333-333333333333',
  displayName: 'Contract Actor',
};

const client = {
  clientId: 'epoca_oauth_client_v1_contract',
  name: 'Reporting warehouse',
  status: 'Active',
  scopes: ['projects:read'],
  projectAccess: { mode: 'AllProjects' },
  version: 4,
  policyVersion: 3,
  secretVersion: 2,
  serviceAccount: {
    userId: '22222222-2222-4222-8222-222222222222',
    displayName: 'Integration Reporting warehouse',
  },
  createdAt: '2026-08-01T08:12:30Z',
  createdBy: actor,
  modifiedAt: '2026-08-19T11:42:10Z',
  modifiedBy: actor,
  secretRotatedAt: '2026-08-10T09:00:00Z',
  secretRotatedBy: actor,
  expiresAt: null,
  revokedAt: null,
  revokedBy: null,
  lastUsedAt: null,
};

const auditEvent = {
  id: '44444444-4444-4444-8444-444444444444',
  occurredAt: '2026-08-19T11:42:10Z',
  actorType: 'Human',
  actorUserId: actor.userId,
  actor,
  eventType: 'Create',
  outcome: 'Success',
  metadata: { version: 1 },
};

const resolveGet = (data: unknown): void => {
  getMock.mockResolvedValueOnce({ data });
};
const resolvePost = (data: unknown): void => {
  postMock.mockResolvedValueOnce({ data });
};
const resolvePatch = (data: unknown): void => {
  patchMock.mockResolvedValueOnce({ data });
};

const invalidPaginationCases = ['pageSize', 'pageNumber'].flatMap((field) =>
  [0, -1, 1.5, Number.NaN].map((value) => ({ field, value })),
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('integration client requests', () => {
  it('lists clients with pagination and an effective-status filter', async () => {
    resolveGet({ count: 1, results: [{ ...client, futureField: 'ignored' }] });

    const result = await listIntegrationClients('acme', {
      pageSize: 20,
      pageNumber: 2,
      status: 'Expired',
    });

    expect(getMock).toHaveBeenCalledWith('/organizations/acme/oauth-clients', {
      params: { pageSize: 20, pageNumber: 2, status: 'Expired' },
    });
    expect(result).toEqual({ count: 1, results: [client] });
  });

  it('omits the effective-status filter when it is not selected', async () => {
    resolveGet({ count: 0, results: [] });

    await listIntegrationClients('acme', { pageSize: 50, pageNumber: 1 });

    expect(getMock).toHaveBeenCalledWith('/organizations/acme/oauth-clients', {
      params: { pageSize: 50, pageNumber: 1 },
    });
  });

  it.each(invalidPaginationCases)('rejects invalid list $field=$value before Axios', async ({ field, value }) => {
    await expect(
      listIntegrationClients('acme', {
        pageSize: 20,
        pageNumber: 1,
        [field]: value,
      }),
    ).rejects.toThrow();

    expect(getMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid runtime effective status before Axios', async () => {
    await expect(
      listIntegrationClients('acme', {
        pageSize: 20,
        pageNumber: 1,
        status: 'Pending',
      } as never),
    ).rejects.toThrow();

    expect(getMock).not.toHaveBeenCalled();
  });

  it('creates a client and parses the one-time response', async () => {
    resolvePost({ client, clientSecret: 'returned-once', futureField: 'ignored' });
    const input = {
      name: 'Reporting warehouse',
      scopes: ['projects:read'] as const,
      projectAccess: {
        mode: 'SelectedProjects' as const,
        projectIds: ['11111111-1111-4111-8111-111111111111'],
      },
      expiresAt: '2027-01-02T03:04:05Z',
    };

    const result = await createIntegrationClient('acme', input);

    expect(postMock).toHaveBeenCalledWith('/organizations/acme/oauth-clients', {
      ...input,
      scopes: ['projects:read'],
    });
    expect(result).toEqual({ client, clientSecret: 'returned-once' });
    expect(result).not.toHaveProperty('data');
  });

  it('gets and parses one client', async () => {
    resolveGet({ ...client, futureField: 'ignored' });

    const result = await getIntegrationClient('acme', client.clientId);

    expect(getMock).toHaveBeenCalledWith(`/organizations/acme/oauth-clients/${client.clientId}`);
    expect(result).toEqual(client);
  });

  it.each([
    ['omitted', {}, {}],
    ['no expiry', { expiresAt: null }, { expiresAt: null }],
    ['selected UTC expiry', { expiresAt: '2027-01-02T03:04:05Z' }, { expiresAt: '2027-01-02T03:04:05Z' }],
  ])('serializes a PATCH with %s', async (_label, expiryInput, expectedExpiry) => {
    resolvePatch(client);

    await updateIntegrationClient('acme', client.clientId, {
      expectedVersion: 4,
      name: 'Reporting warehouse renewed',
      ...expiryInput,
    });

    expect(patchMock).toHaveBeenCalledWith(`/organizations/acme/oauth-clients/${client.clientId}`, {
      expectedVersion: 4,
      name: 'Reporting warehouse renewed',
      ...expectedExpiry,
    });
  });

  it('patches replacement scopes and SelectedProjects and returns only the parsed public client', async () => {
    const replacementPolicy = {
      scopes: ['projects:read', 'reports:read'] as const,
      projectAccess: {
        mode: 'SelectedProjects' as const,
        projectIds: ['11111111-1111-4111-8111-111111111111'],
      },
    };
    const updatedClient = {
      ...client,
      ...replacementPolicy,
      name: 'Reporting warehouse renewed',
      version: 5,
      policyVersion: 4,
    };
    resolvePatch({ ...updatedClient, futureField: 'ignored' });

    const result = await updateIntegrationClient('acme', client.clientId, {
      expectedVersion: 4,
      name: 'Reporting warehouse renewed',
      ...replacementPolicy,
    });

    expect(patchMock).toHaveBeenCalledWith(`/organizations/acme/oauth-clients/${client.clientId}`, {
      expectedVersion: 4,
      name: 'Reporting warehouse renewed',
      scopes: ['projects:read', 'reports:read'],
      projectAccess: {
        mode: 'SelectedProjects',
        projectIds: ['11111111-1111-4111-8111-111111111111'],
      },
    });
    expect(result).toEqual(updatedClient);
    expect(result).not.toHaveProperty('futureField');
    expect(result).not.toHaveProperty('data');
  });

  it('rejects an expectedVersion-only no-op PATCH before Axios', async () => {
    await expect(updateIntegrationClient('acme', client.clientId, { expectedVersion: 4 })).rejects.toThrow();

    expect(patchMock).not.toHaveBeenCalled();
  });

  it('rotates a secret with the expected version and parses the one-time response', async () => {
    resolvePost({ client, clientSecret: 'rotated-once' });

    const result = await rotateIntegrationClientSecret('acme', client.clientId, 4);

    expect(postMock).toHaveBeenCalledWith(`/organizations/acme/oauth-clients/${client.clientId}/rotate-secret`, {
      expectedVersion: 4,
    });
    expect(result).toEqual({ client, clientSecret: 'rotated-once' });
  });

  it('revokes a client with the expected version and parses the public client', async () => {
    resolvePost({ ...client, status: 'Revoked' });

    const result = await revokeIntegrationClient('acme', client.clientId, 4);

    expect(postMock).toHaveBeenCalledWith(`/organizations/acme/oauth-clients/${client.clientId}/revoke`, {
      expectedVersion: 4,
    });
    expect(result.status).toBe('Revoked');
  });

  it('lists and parses audit events with pagination', async () => {
    resolveGet({ count: 1, results: [auditEvent] });

    const result = await listIntegrationClientAuditEvents('acme', client.clientId, {
      pageSize: 25,
      pageNumber: 3,
    });

    expect(getMock).toHaveBeenCalledWith(`/organizations/acme/oauth-clients/${client.clientId}/audit-events`, {
      params: { pageSize: 25, pageNumber: 3 },
    });
    expect(result).toEqual({ count: 1, results: [auditEvent] });
  });

  it.each(invalidPaginationCases)('rejects invalid audit $field=$value before Axios', async ({ field, value }) => {
    await expect(
      listIntegrationClientAuditEvents('acme', client.clientId, {
        pageSize: 25,
        pageNumber: 1,
        [field]: value,
      }),
    ).rejects.toThrow();

    expect(getMock).not.toHaveBeenCalled();
  });

  it('URL-encodes organization slugs and client IDs as path segments', async () => {
    resolveGet(client);

    await getIntegrationClient('acme team', 'client/id?revision=1');

    expect(getMock).toHaveBeenCalledWith('/organizations/acme%20team/oauth-clients/client%2Fid%3Frevision%3D1');
  });

  it('rejects an invalid response instead of returning raw response data', async () => {
    resolveGet({ count: 1, results: [{ ...client, clientSecret: 'SECRET_SENTINEL' }] });

    await expect(listIntegrationClients('acme', { pageSize: 20, pageNumber: 1 })).rejects.toThrow();
  });
});

describe('normalizeIntegrationClientProblem', () => {
  const responseError = (status: number, data: unknown): unknown => ({
    isAxiosError: true,
    name: 'AxiosError',
    message: 'Request failed',
    response: { status, data },
  });

  it.each([
    ['result:oauth-client:invalid-expiration', 400, { kind: 'invalid-expiration', status: 400 }],
    ['result:oauth-client:invalid-policy', 400, { kind: 'invalid-policy', status: 400 }],
    ['result:oauth-client:name-conflict', 409, { kind: 'name-conflict', status: 409 }],
    ['result:oauth-client:not-active', 409, { kind: 'not-active', status: 409 }],
    ['result:oauth-client:client-not-found', 404, { kind: 'client-not-found', status: 404 }],
  ])('normalizes %s', (type, status, expected) => {
    expect(normalizeIntegrationClientProblem(responseError(status, { type, status, title: 'safe' }))).toEqual(expected);
  });

  it('keeps only the stale-version currentVersion extension', () => {
    const result = normalizeIntegrationClientProblem(
      responseError(409, {
        type: 'result:oauth-client:stale-version',
        status: 409,
        title: 'stale',
        extension: { currentVersion: 7, clientSecret: 'SECRET_SENTINEL' },
        raw: 'SECRET_SENTINEL',
      }),
    );

    expect(result).toEqual({ kind: 'stale-version', status: 409, currentVersion: 7 });
    expect(JSON.stringify(result)).not.toContain('SECRET_SENTINEL');
  });

  it('recognizes a problem type independently from malformed optional members', () => {
    expect(
      normalizeIntegrationClientProblem(
        responseError(409, {
          type: 'result:oauth-client:name-conflict',
          status: '409',
          extension: null,
        }),
      ),
    ).toEqual({ kind: 'name-conflict', status: 409 });
  });

  it('accepts a null stale-version extension without retaining response data', () => {
    expect(
      normalizeIntegrationClientProblem(
        responseError(409, {
          type: 'result:oauth-client:stale-version',
          extension: null,
          raw: 'SECRET_SENTINEL',
        }),
      ),
    ).toEqual({ kind: 'stale-version', status: 409, currentVersion: null });
  });

  it.each(['7', 0, -1, 1.5, Number.NaN])(
    'drops invalid stale-version currentVersion %p without dropping the recognized type',
    (currentVersion) => {
      expect(
        normalizeIntegrationClientProblem(
          responseError(409, {
            type: 'result:oauth-client:stale-version',
            extension: { currentVersion },
          }),
        ),
      ).toEqual({ kind: 'stale-version', status: 409, currentVersion: null });
    },
  );

  it('uses the HTTP response status when the problem body status disagrees', () => {
    expect(
      normalizeIntegrationClientProblem(
        responseError(409, {
          type: 'result:oauth-client:name-conflict',
          status: 400,
        }),
      ),
    ).toEqual({ kind: 'name-conflict', status: 409 });
  });

  it('normalizes forbidden and service-unavailable responses without retaining their bodies', () => {
    expect(normalizeIntegrationClientProblem(responseError(403, { authorization: 'SECRET_SENTINEL' }))).toEqual({
      kind: 'forbidden',
      status: 403,
    });
    expect(
      normalizeIntegrationClientProblem(
        responseError(503, {
          type: 'result:error:service-unavailable',
          status: 503,
          title: 'Service unavailable',
        }),
      ),
    ).toEqual({ kind: 'service-unavailable', status: 503 });
  });

  it.each([
    [
      { isAxiosError: true, name: 'AxiosError', message: 'timeout', code: 'ECONNABORTED' },
      { kind: 'timeout', status: null },
    ],
    [
      { isAxiosError: true, name: 'AxiosError', message: 'Network Error' },
      { kind: 'transport', status: null },
    ],
  ])('normalizes timeout/transport errors', (error, expected) => {
    expect(normalizeIntegrationClientProblem(error)).toEqual(expected);
  });

  it('returns a safe unexpected classification for malformed or non-Axios errors', () => {
    expect(normalizeIntegrationClientProblem(responseError(418, { clientSecret: 'SECRET_SENTINEL' }))).toEqual({
      kind: 'unexpected',
      status: 418,
    });
    expect(normalizeIntegrationClientProblem(new Error('SECRET_SENTINEL'))).toEqual({
      kind: 'unexpected',
      status: null,
    });
  });

  it('classifies a page rejected by IntegrationClientPageSchema.parse as validation, not unexpected', async () => {
    resolveGet({ results: [] });

    const rejection = listIntegrationClients('acme', { pageSize: 20, pageNumber: 1 });
    await expect(rejection).rejects.toThrow();
    const thrown = await rejection.catch((error: unknown) => error);

    expect(normalizeIntegrationClientProblem(thrown)).toEqual({ kind: 'validation', status: null });
  });

  it('classifies a page rejected for a detected sensitive field as validation, without leaking it', async () => {
    resolveGet({ count: 1, results: [{ ...client, clientSecret: 'SECRET_SENTINEL' }] });

    const rejection = listIntegrationClients('acme', { pageSize: 20, pageNumber: 1 });
    await expect(rejection).rejects.toThrow();
    const thrown = await rejection.catch((error: unknown) => error);

    const result = normalizeIntegrationClientProblem(thrown);
    expect(result).toEqual({ kind: 'validation', status: null });
    expect(JSON.stringify(result)).not.toContain('SECRET_SENTINEL');
  });
});
