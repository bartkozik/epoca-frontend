import { UtcTimestampSchema } from '@/core/models/utcTimestamp.model';
import { z } from 'zod';
import { IntegrationClientProjectAccessSchema, OAuthScopeSchema } from './integrationClientDto.model';

export const CreateIntegrationClientInputSchema = z
  .object({
    name: z.string().min(1),
    scopes: z.array(OAuthScopeSchema).min(1),
    projectAccess: IntegrationClientProjectAccessSchema,
    expiresAt: UtcTimestampSchema.nullable().optional(),
  })
  .strip();
