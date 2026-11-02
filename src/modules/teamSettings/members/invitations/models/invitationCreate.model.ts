import { OrganizationUserRole } from '@/core/models/enums';
import { z } from 'zod';

const InvitationNameSchema = z
  .string()
  .trim()
  .min(1, 'invitations.validation.name')
  .max(200, 'invitations.validation.name')
  .refine((value) => !Array.from(value).some((char) => char.charCodeAt(0) < 32), 'invitations.validation.name');

export const InvitationCreateSchema = z
  .object({
    firstName: InvitationNameSchema,
    lastName: InvitationNameSchema,
    email: z.string().trim().max(320, 'invitations.validation.email').email('invitations.validation.email'),
    role: z.nativeEnum(OrganizationUserRole, { errorMap: () => ({ message: 'invitations.validation.role' }) }),
    locale: z.enum(['pl', 'en'], { errorMap: () => ({ message: 'invitations.validation.locale' }) }),
  })
  .strict();
export type InvitationCreate = z.infer<typeof InvitationCreateSchema>;
