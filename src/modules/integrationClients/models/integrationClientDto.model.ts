import { CanonicalUuidSchema } from '@/core/models/canonicalUuid.model';
import { SensitiveFieldsShape } from '@/core/models/sensitiveFields.model';
import { UtcTimestampSchema } from '@/core/models/utcTimestamp.model';
import { z } from 'zod';

export const OAUTH_SCOPES = [
  'organization:read',
  'users:read',
  'clients:read',
  'projects:read',
  'work-units:read',
  'work-units:write',
  'reports:read',
  'reports:export',
] as const;

export const OAuthScopeSchema = z.enum(OAUTH_SCOPES);

export type OAuthScope = z.infer<typeof OAuthScopeSchema>;

export const IntegrationClientStatusSchema = z.enum(['Active', 'Expired', 'Revoked']);

export type IntegrationClientStatus = z.infer<typeof IntegrationClientStatusSchema>;

export const ProjectAccessModeSchema = z.enum(['AllProjects', 'SelectedProjects']);

export type ProjectAccessMode = z.infer<typeof ProjectAccessModeSchema>;

// Shared by the audit metadata, version-input, and update-input schemas.
export const PositiveVersionSchema = z.number().int().positive();

export const IntegrationClientActorSchema = z
  .object({
    userId: CanonicalUuidSchema,
    displayName: z.string(),
    ...SensitiveFieldsShape,
  })
  .strip();

export type IntegrationClientActor = z.infer<typeof IntegrationClientActorSchema>;

const allProjectsAccessSchema = z
  .object({
    mode: z.literal('AllProjects'),
    projectIds: z.never().optional(),
    ...SensitiveFieldsShape,
  })
  .strip();

const selectedProjectsAccessSchema = z
  .object({
    mode: z.literal('SelectedProjects'),
    projectIds: z.array(CanonicalUuidSchema).min(1),
    ...SensitiveFieldsShape,
  })
  .strip();

export const IntegrationClientProjectAccessSchema = z.discriminatedUnion('mode', [
  allProjectsAccessSchema,
  selectedProjectsAccessSchema,
]);

export type IntegrationClientProjectAccess = z.infer<typeof IntegrationClientProjectAccessSchema>;

export const IntegrationClientSchema = z
  .object({
    clientId: z.string().min(1),
    name: z.string().min(1),
    status: IntegrationClientStatusSchema,
    scopes: z.array(OAuthScopeSchema),
    projectAccess: IntegrationClientProjectAccessSchema,
    version: z.number().int().positive(),
    policyVersion: z.number().int().positive(),
    secretVersion: z.number().int().positive(),
    serviceAccount: IntegrationClientActorSchema,
    createdAt: UtcTimestampSchema,
    createdBy: IntegrationClientActorSchema,
    modifiedAt: UtcTimestampSchema,
    modifiedBy: IntegrationClientActorSchema,
    secretRotatedAt: UtcTimestampSchema,
    secretRotatedBy: IntegrationClientActorSchema,
    expiresAt: UtcTimestampSchema.nullable(),
    revokedAt: UtcTimestampSchema.nullable(),
    revokedBy: IntegrationClientActorSchema.nullable(),
    lastUsedAt: UtcTimestampSchema.nullable(),
    ...SensitiveFieldsShape,
  })
  .strip();

export type IntegrationClient = z.infer<typeof IntegrationClientSchema>;

// Returned by both create and rotate-secret -- shared here rather than duplicated per-operation.
export const OneTimeIntegrationClientSecretSchema = z
  .object({
    client: IntegrationClientSchema,
    clientSecret: z.string().min(1),
    secretHash: z.never().optional(),
    accessToken: z.never().optional(),
    authorization: z.never().optional(),
  })
  .strip();

export type OneTimeIntegrationClientSecret = z.infer<typeof OneTimeIntegrationClientSecretSchema>;
