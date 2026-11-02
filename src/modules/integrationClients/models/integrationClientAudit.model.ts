import { CanonicalUuidSchema } from '@/core/models/canonicalUuid.model';
import { SensitiveFieldsShape } from '@/core/models/sensitiveFields.model';
import { UtcTimestampSchema } from '@/core/models/utcTimestamp.model';
import {
  IntegrationClientActorSchema,
  OAuthScopeSchema,
  PositiveVersionSchema,
  ProjectAccessModeSchema,
} from '@/modules/integrationClients/models/integrationClientDto.model';
import { z } from 'zod';

const nullableUtcTimestampSchema = UtcTimestampSchema.nullable();

export const IntegrationClientAuditMetadataSchema = z
  .object({
    scopes: z.array(OAuthScopeSchema).optional(),
    beforeScopes: z.array(OAuthScopeSchema).optional(),
    afterScopes: z.array(OAuthScopeSchema).optional(),
    projectMode: ProjectAccessModeSchema.optional(),
    beforeProjectMode: ProjectAccessModeSchema.optional(),
    afterProjectMode: ProjectAccessModeSchema.optional(),
    projectIds: z.array(CanonicalUuidSchema).optional(),
    beforeProjectIds: z.array(CanonicalUuidSchema).optional(),
    afterProjectIds: z.array(CanonicalUuidSchema).optional(),
    version: PositiveVersionSchema.optional(),
    policyVersion: PositiveVersionSchema.optional(),
    secretVersion: PositiveVersionSchema.optional(),
    beforeVersion: PositiveVersionSchema.optional(),
    afterVersion: PositiveVersionSchema.optional(),
    beforePolicyVersion: PositiveVersionSchema.optional(),
    afterPolicyVersion: PositiveVersionSchema.optional(),
    beforeSecretVersion: PositiveVersionSchema.optional(),
    afterSecretVersion: PositiveVersionSchema.optional(),
    expiresAt: nullableUtcTimestampSchema.optional(),
    beforeExpiresAt: nullableUtcTimestampSchema.optional(),
    afterExpiresAt: nullableUtcTimestampSchema.optional(),
    failureCategory: z
      .enum([
        'malformed-credentials',
        'unknown-client',
        'invalid-secret',
        'revoked-client',
        'expired-client',
        'malformed-scope',
        'unknown-scope',
        'ungranted-scope',
        'ip-rate-limit',
        'client-rate-limit',
      ])
      .optional(),
    ...SensitiveFieldsShape,
  })
  .strip();

export type IntegrationClientAuditMetadata = z.infer<typeof IntegrationClientAuditMetadataSchema>;

export const IntegrationClientAuditEventSchema = z
  .object({
    id: CanonicalUuidSchema,
    occurredAt: UtcTimestampSchema,
    actorType: z.enum(['Human', 'ServiceAccount', 'Anonymous', 'System']),
    actorUserId: CanonicalUuidSchema.nullable(),
    actor: IntegrationClientActorSchema.nullable(),
    eventType: z.enum([
      'Create',
      'Update',
      'Rotate',
      'Revoke',
      'TokenIssued',
      'InvalidClient',
      'InvalidScope',
      'RateLimit',
    ]),
    outcome: z.enum(['Success', 'Failure']),
    metadata: IntegrationClientAuditMetadataSchema,
    ...SensitiveFieldsShape,
  })
  .strip();

export type IntegrationClientAuditEvent = z.infer<typeof IntegrationClientAuditEventSchema>;

// Audit pages use the same strict contract as client pages: do not drop malformed events or
// accept known sensitive fields on the response envelope.
export const IntegrationClientAuditPageSchema = z
  .object({
    count: z.number().int().nonnegative(),
    results: z.array(IntegrationClientAuditEventSchema),
    ...SensitiveFieldsShape,
  })
  .strip();

export type IntegrationClientAuditPage = z.infer<typeof IntegrationClientAuditPageSchema>;
