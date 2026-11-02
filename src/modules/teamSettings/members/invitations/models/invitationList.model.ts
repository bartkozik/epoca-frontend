import { tolerantArray } from '@/core/models/tolerantArray.model';
import { z } from 'zod';
import { InvitationDtoSchema } from './invitationDto.model';

export const InvitationListParamsSchema = z
  .object({ pageSize: z.number().int().min(1).max(200), pageNumber: z.number().int().min(1) })
  .strict();
export const InvitationPageSchema = z
  .object({
    count: z.number().int().nonnegative(),
    results: tolerantArray(InvitationDtoSchema),
    featureEnabled: z.boolean(),
  })
  .strip();
export type InvitationListParams = z.infer<typeof InvitationListParamsSchema>;
export type InvitationPage = z.infer<typeof InvitationPageSchema>;
