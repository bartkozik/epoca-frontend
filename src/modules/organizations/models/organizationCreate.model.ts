import { MAX_NAME_LENGTH } from '@/core/utils/constants';
import { z } from 'zod';

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
