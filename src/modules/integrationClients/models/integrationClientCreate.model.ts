import { UtcTimestampSchema } from '@/core/models/utcTimestamp.model';
import { z } from 'zod';
import { IntegrationClientProjectAccessSchema, OAuthScopeSchema } from './integrationClientDto.model';

// No exported z.infer type here: types.ts's hand-written CreateIntegrationClientInput is the real
// input contract (readonly arrays, since callers pass a draft's arrays through without copying) --
// a plain z.infer of this schema would be a mutable-array duplicate nothing needs, since every
// caller already builds a CreateIntegrationClientInput and only requests.ts ever calls .parse() on
// it, purely as a runtime safety net at the API boundary.
export const CreateIntegrationClientInputSchema = z
  .object({
    name: z.string().min(1),
    scopes: z.array(OAuthScopeSchema).min(1),
    projectAccess: IntegrationClientProjectAccessSchema,
    expiresAt: UtcTimestampSchema.nullable().optional(),
  })
  .strip();
