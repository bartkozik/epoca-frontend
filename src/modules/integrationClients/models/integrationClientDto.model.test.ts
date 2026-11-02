import {
  IntegrationClientActorSchema,
  IntegrationClientProjectAccessSchema,
  IntegrationClientSchema,
  OneTimeIntegrationClientSecretSchema,
} from './integrationClientDto.model';

const actor = {
  userId: '33333333-3333-4333-8333-333333333333',
  displayName: 'Contract Actor',
};

const validClient = {
  clientId: 'epoca_oauth_client_v1_contract',
  name: 'Reporting warehouse',
  status: 'Active' as const,
  scopes: [
    'organization:read',
    'users:read',
    'clients:read',
    'projects:read',
    'work-units:read',
    'work-units:write',
    'reports:read',
    'reports:export',
  ],
  projectAccess: {
    mode: 'SelectedProjects' as const,
    projectIds: ['11111111-1111-4111-8111-111111111111'],
  },
  version: 4,
  policyVersion: 3,
  secretVersion: 2,
  serviceAccount: {
    userId: '22222222-2222-4222-8222-222222222222',
    displayName: 'Integration Reporting warehouse',
  },
  createdAt: '2026-08-01T08:12:30Z',
  createdBy: actor,
  modifiedAt: '2026-08-19T11:42:10.123456Z',
  modifiedBy: actor,
  secretRotatedAt: '2026-08-10T09:00:00Z',
  secretRotatedBy: actor,
  expiresAt: '2026-12-31T22:59:00Z',
  revokedAt: null,
  revokedBy: null,
  lastUsedAt: null,
};

const sensitiveKeys = ['clientSecret', 'secretHash', 'accessToken', 'authorization'] as const;
const projectAccessVariants = [
  { mode: 'AllProjects' as const },
  {
    mode: 'SelectedProjects' as const,
    projectIds: ['11111111-1111-4111-8111-111111111111'],
  },
];
const sensitiveProjectAccessCases = projectAccessVariants.flatMap((projectAccess) =>
  sensitiveKeys.map((key) => ({ key, projectAccess })),
);

describe('IntegrationClientSchema', () => {
  it.each(['Active', 'Expired', 'Revoked'] as const)('parses the complete %s CT-537 client', (status) => {
    const result = IntegrationClientSchema.parse({ ...validClient, status });

    expect(result.status).toBe(status);
    expect(result).toEqual({ ...validClient, status });
  });

  it.each(Object.keys(validClient))('rejects a client missing required field %s', (field) => {
    const input = { ...validClient } as Record<string, unknown>;
    delete input[field];

    expect(() => IntegrationClientSchema.parse(input)).toThrow();
  });

  it.each([
    ['createdAt', '2026-08-01T08:12:30'],
    ['modifiedAt', '2026-08-19T13:42:10+02:00'],
    ['secretRotatedAt', 'not-a-date'],
    ['expiresAt', '2026-08-19'],
    ['revokedAt', '2026-13-19T11:42:10Z'],
    ['lastUsedAt', '2026-08-19T11:42:10+00:00'],
  ])('rejects malformed or non-UTC %s', (field, value) => {
    expect(() => IntegrationClientSchema.parse({ ...validClient, [field]: value })).toThrow();
  });

  it.each(['Pending', 'Disabled'])('rejects unknown status %s', (status) => {
    expect(() => IntegrationClientSchema.parse({ ...validClient, status })).toThrow();
  });

  it('rejects an unknown OAuth scope', () => {
    expect(() => IntegrationClientSchema.parse({ ...validClient, scopes: ['projects:admin'] })).toThrow();
  });

  it.each([
    { mode: 'AllProjects', projectIds: [] },
    { mode: 'SelectedProjects', projectIds: [] },
    { mode: 'SelectedProjects' },
    { mode: 'SpecificProjects', projectIds: ['11111111-1111-4111-8111-111111111111'] },
  ])('rejects invalid project access %#', (projectAccess) => {
    expect(() => IntegrationClientSchema.parse({ ...validClient, projectAccess })).toThrow();
  });

  it('strips additive client and actor fields', () => {
    const result = IntegrationClientSchema.parse({
      ...validClient,
      futureField: 'ignored',
      createdBy: { ...actor, futureActorField: 'ignored' },
    });

    expect(result).not.toHaveProperty('futureField');
    expect(result.createdBy).toEqual(actor);
  });

  it.each(['clientSecret', 'secretHash', 'accessToken', 'authorization'])('rejects sensitive client key %s', (key) => {
    expect(() => IntegrationClientSchema.parse({ ...validClient, [key]: 'SECRET_SENTINEL' })).toThrow();
  });

  it.each(['clientSecret', 'secretHash', 'accessToken', 'authorization'])('rejects sensitive actor key %s', (key) => {
    expect(() =>
      IntegrationClientSchema.parse({ ...validClient, createdBy: { ...actor, [key]: 'SECRET_SENTINEL' } }),
    ).toThrow();
  });

  it.each(['userId', 'displayName'])('rejects an actor missing required field %s', (field) => {
    const input = { ...actor } as Record<string, unknown>;
    delete input[field];

    expect(() => IntegrationClientActorSchema.parse(input)).toThrow();
  });

  it.each(sensitiveProjectAccessCases)(
    'rejects $key in $projectAccess.mode project access directly and under public clients',
    ({ key, projectAccess }) => {
      const unsafeProjectAccess = { ...projectAccess, [key]: 'SECRET_SENTINEL' };

      expect(() => IntegrationClientProjectAccessSchema.parse(unsafeProjectAccess)).toThrow();
      expect(() => IntegrationClientSchema.parse({ ...validClient, projectAccess: unsafeProjectAccess })).toThrow();
      expect(() =>
        OneTimeIntegrationClientSecretSchema.parse({
          client: { ...validClient, projectAccess: unsafeProjectAccess },
          clientSecret: 'returned-once',
        }),
      ).toThrow();
    },
  );
});

describe('OneTimeIntegrationClientSecretSchema', () => {
  it('accepts clientSecret only in an outer one-time response', () => {
    const result = OneTimeIntegrationClientSecretSchema.parse({
      client: validClient,
      clientSecret: 'returned-once',
      futureField: 'ignored',
    });

    expect(result).toEqual({ client: validClient, clientSecret: 'returned-once' });
    expect(() =>
      OneTimeIntegrationClientSecretSchema.parse({
        client: { ...validClient, clientSecret: 'nested-secret' },
        clientSecret: 'returned-once',
      }),
    ).toThrow();
  });

  it.each(['client', 'clientSecret'])('rejects a one-time response missing required field %s', (field) => {
    const input = { client: validClient, clientSecret: 'returned-once' } as Record<string, unknown>;
    delete input[field];

    expect(() => OneTimeIntegrationClientSecretSchema.parse(input)).toThrow();
  });

  it.each(['secretHash', 'accessToken', 'authorization'] as const)(
    'rejects forbidden outer one-time key %s while reserving clientSecret for the envelope',
    (key) => {
      expect(() =>
        OneTimeIntegrationClientSecretSchema.parse({
          client: validClient,
          clientSecret: 'returned-once',
          [key]: 'SECRET_SENTINEL',
        }),
      ).toThrow();
    },
  );
});
