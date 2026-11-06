import { z } from 'zod';
import { PositiveVersionSchema } from './integrationClientDto.model';

export const IntegrationClientVersionInputSchema = z
  .object({
    expectedVersion: PositiveVersionSchema,
  })
  .strip();
export type IntegrationClientVersionInput = z.infer<typeof IntegrationClientVersionInputSchema>;
