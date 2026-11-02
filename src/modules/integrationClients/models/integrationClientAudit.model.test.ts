import { IntegrationClientAuditEventSchema, IntegrationClientAuditPageSchema } from './integrationClientAudit.model';

const actor = {
  userId: '33333333-3333-4333-8333-333333333333',
  displayName: 'Contract Actor',
};

const validAuditEvent = {
  id: '44444444-4444-4444-8444-444444444444',
  occurredAt: '2026-08-19T11:42:10.123456Z',
  actorType: 'Human' as const,
  actorUserId: actor.userId,
  actor,
  eventType: 'Update' as const,
  outcome: 'Success' as const,
  metadata: {
    beforeScopes: ['projects:read'],
    afterScopes: ['projects:read', 'reports:read'],
    beforeProjectMode: 'SelectedProjects',
    afterProjectMode: 'AllProjects',
    beforeProjectIds: ['11111111-1111-4111-8111-111111111111'],
    afterProjectIds: [],
    beforeVersion: 3,
    afterVersion: 4,
    beforePolicyVersion: 2,
    afterPolicyVersion: 3,
    beforeSecretVersion: 2,
    afterSecretVersion: 2,
    beforeExpiresAt: null,
    afterExpiresAt: '2026-12-31T22:59:00Z',
  },
};

const sensitiveKeys = ['clientSecret', 'secretHash', 'accessToken', 'authorization'] as const;

describe('IntegrationClientAuditEventSchema', () => {
  it('parses a complete event and allows a nullable actor', () => {
    expect(IntegrationClientAuditEventSchema.parse(validAuditEvent)).toEqual(validAuditEvent);
    expect(
      IntegrationClientAuditEventSchema.parse({
        ...validAuditEvent,
        actorType: 'System',
        actorUserId: null,
        actor: null,
      }),
    ).toMatchObject({ actorType: 'System', actorUserId: null, actor: null });
  });

  it.each(Object.keys(validAuditEvent))('rejects an audit event missing required field %s', (field) => {
    const input = { ...validAuditEvent } as Record<string, unknown>;
    delete input[field];

    expect(() => IntegrationClientAuditEventSchema.parse(input)).toThrow();
  });

  it.each([
    ['actorType', 'Robot'],
    ['eventType', 'Delete'],
    ['outcome', 'Pending'],
  ])('rejects invalid audit %s', (field, value) => {
    expect(() => IntegrationClientAuditEventSchema.parse({ ...validAuditEvent, [field]: value })).toThrow();
  });

  it('rejects invalid scope, project mode, and timestamp metadata', () => {
    expect(() =>
      IntegrationClientAuditEventSchema.parse({
        ...validAuditEvent,
        metadata: { scopes: ['projects:admin'] },
      }),
    ).toThrow();
    expect(() =>
      IntegrationClientAuditEventSchema.parse({
        ...validAuditEvent,
        metadata: { projectMode: 'SpecificProjects' },
      }),
    ).toThrow();
    expect(() =>
      IntegrationClientAuditEventSchema.parse({
        ...validAuditEvent,
        metadata: { expiresAt: '2026-08-19T13:42:10+02:00' },
      }),
    ).toThrow();
  });

  it('strips additive audit, actor, and metadata fields', () => {
    const result = IntegrationClientAuditEventSchema.parse({
      ...validAuditEvent,
      futureField: 'ignored',
      actor: { ...actor, futureActorField: 'ignored' },
      metadata: { ...validAuditEvent.metadata, futureMetadataField: 'ignored' },
    });

    expect(result).not.toHaveProperty('futureField');
    expect(result.actor).toEqual(actor);
    expect(result.metadata).not.toHaveProperty('futureMetadataField');
  });

  it.each(['clientSecret', 'secretHash', 'accessToken', 'authorization'])('rejects sensitive audit key %s', (key) => {
    expect(() => IntegrationClientAuditEventSchema.parse({ ...validAuditEvent, [key]: 'SECRET_SENTINEL' })).toThrow();
  });

  it('parses an audit page', () => {
    expect(IntegrationClientAuditPageSchema.parse({ count: 1, results: [validAuditEvent] })).toEqual({
      count: 1,
      results: [validAuditEvent],
    });
  });

  it.each(['count', 'results'])('rejects an audit page missing required field %s', (field) => {
    const input = { count: 1, results: [validAuditEvent] } as Record<string, unknown>;
    delete input[field];

    expect(() => IntegrationClientAuditPageSchema.parse(input)).toThrow();
  });

  const sensitiveAuditLocations = [
    {
      label: 'audit event envelope',
      input: (key: (typeof sensitiveKeys)[number]) => ({ ...validAuditEvent, [key]: 'SECRET_SENTINEL' }),
      parse: (input: unknown) => IntegrationClientAuditEventSchema.parse(input),
    },
    {
      label: 'audit metadata',
      input: (key: (typeof sensitiveKeys)[number]) => ({
        ...validAuditEvent,
        metadata: { ...validAuditEvent.metadata, [key]: 'SECRET_SENTINEL' },
      }),
      parse: (input: unknown) => IntegrationClientAuditEventSchema.parse(input),
    },
    {
      label: 'audit actor',
      input: (key: (typeof sensitiveKeys)[number]) => ({
        ...validAuditEvent,
        actor: { ...actor, [key]: 'SECRET_SENTINEL' },
      }),
      parse: (input: unknown) => IntegrationClientAuditEventSchema.parse(input),
    },
    {
      label: 'audit page envelope',
      input: (key: (typeof sensitiveKeys)[number]) => ({
        count: 1,
        results: [validAuditEvent],
        [key]: 'SECRET_SENTINEL',
      }),
      parse: (input: unknown) => IntegrationClientAuditPageSchema.parse(input),
    },
  ];

  it.each(sensitiveAuditLocations)('rejects every known sensitive key at the $label', ({ input, parse }) => {
    sensitiveKeys.forEach((key) => {
      expect(() => parse(input(key))).toThrow();
    });
  });
});
