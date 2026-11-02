import { MAX_NAME_LENGTH } from '@/core/utils/constants';
import { z } from 'zod';

// No edit-organization form exists yet in the app -- built ahead of that UI per the ticket's AC,
// same as organizationCreate.model.ts.
export const OrganizationUpdateRequestSchema = z.object({
  name: z
    .string()
    .min(1, 'organizations.error.name_required')
    .max(MAX_NAME_LENGTH, 'organizations.error.name_too_long'),
});

export type OrganizationUpdateRequest = z.infer<typeof OrganizationUpdateRequestSchema>;
