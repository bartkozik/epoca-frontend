import { MAX_NAME_LENGTH } from '@/core/utils/constants';
import { z } from 'zod';

// No add-organization form exists yet in the app (WorkspaceSelect only lets a user pick among
// their existing organizations) -- this schema is built ahead of that UI per the ticket's AC, not
// relocated from one. Messages are i18n keys, resolved later via handleValidationErrors.
export const OrganizationCreateRequestSchema = z.object({
  name: z
    .string()
    .min(1, 'organizations.error.name_required')
    .max(MAX_NAME_LENGTH, 'organizations.error.name_too_long'),
  slug: z
    .string()
    .min(1, 'organizations.error.slug_required')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'organizations.error.slug_invalid'),
});

export type OrganizationCreateRequest = z.infer<typeof OrganizationCreateRequestSchema>;
