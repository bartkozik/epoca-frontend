import { z } from 'zod';
import { PositiveVersionSchema } from './integrationClientDto.model';

// Shared expectedVersion-only input for the rotate-secret and revoke mutations.
export const IntegrationClientVersionInputSchema = z
  .object({
    expectedVersion: PositiveVersionSchema,
  })
  .strip();
export type IntegrationClientVersionInput = z.infer<typeof IntegrationClientVersionInputSchema>;
