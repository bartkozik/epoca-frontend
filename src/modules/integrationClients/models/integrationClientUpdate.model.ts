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
    // Never actually surfaces to a user today (the form layer already filters out no-op updates
    // before this schema is called, and any rejection here collapses into a generic
    // invalidInputProblem) -- kept as an i18n key rather than a resolved string only to match this
    // repo's Zod convention (see CLAUDE.md), matching organizationUpdate.model.ts's message style.
    { message: 'integration_clients.error.at_least_one_field_required' },
  );
// No exported z.infer type here -- see CreateIntegrationClientInputSchema's comment; the same
// readonly-array reasoning applies to types.ts's hand-written UpdateIntegrationClientInput.
