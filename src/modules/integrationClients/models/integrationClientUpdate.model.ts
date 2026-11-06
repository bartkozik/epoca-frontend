import { UtcTimestampSchema } from '@/core/models/utcTimestamp.model';
import { z } from 'zod';
import {
  IntegrationClientProjectAccessSchema,
  OAuthScopeSchema,
  PositiveVersionSchema,
} from './integrationClientDto.model';

export const UpdateIntegrationClientInputSchema = z
  .object({
    expectedVersion: PositiveVersionSchema,
    name: z.string().min(1).optional(),
    scopes: z.array(OAuthScopeSchema).min(1).optional(),
    projectAccess: IntegrationClientProjectAccessSchema.optional(),
    expiresAt: UtcTimestampSchema.nullable().optional(),
  })
  .strip()
  .refine(
    ({ name, scopes, projectAccess, expiresAt }) =>
      name !== undefined || scopes !== undefined || projectAccess !== undefined || expiresAt !== undefined,
    { message: 'integration_clients.error.at_least_one_field_required' },
  );
