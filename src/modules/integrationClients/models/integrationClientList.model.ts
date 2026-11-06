import { SensitiveFieldsShape } from '@/core/models/sensitiveFields.model';
import {
  IntegrationClientSchema,
  IntegrationClientStatusSchema,
} from '@/modules/integrationClients/models/integrationClientDto.model';
import { z } from 'zod';

export const IntegrationClientPaginationSchema = z
  .object({
    pageSize: z.number().int().positive(),
    pageNumber: z.number().int().positive(),
  })
  .strip();

export type IntegrationClientPagination = z.infer<typeof IntegrationClientPaginationSchema>;

export const IntegrationClientListParamsSchema = IntegrationClientPaginationSchema.extend({
  status: IntegrationClientStatusSchema.optional(),
}).strip();

export type IntegrationClientListParams = z.infer<typeof IntegrationClientListParamsSchema>;

export const IntegrationClientPageSchema = z
  .object({
    count: z.number().int().nonnegative(),
    results: z.array(IntegrationClientSchema),
    ...SensitiveFieldsShape,
  })
  .strip();

export type IntegrationClientPage = z.infer<typeof IntegrationClientPageSchema>;
