import { InvitationNextActionSchema } from '@/core/models/invitationNextAction.model';
import { z } from 'zod';

const RevisionSchema = z.string().regex(/^\d+$/);
export const InvitationSummarySchema = z
  .object({
    organization: z.object({ name: z.string(), slug: z.string().min(1) }).strip(),
    email: z.string().email(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    roles: z.array(z.string()),
    revision: RevisionSchema,
    expiresAt: z.string().datetime({ offset: true }),
    csrfToken: z.string().min(1),
    nextAction: InvitationNextActionSchema,
    ssoEnabled: z.boolean(),
  })
  .strip();
export type InvitationSummary = z.infer<typeof InvitationSummarySchema>;
export const InvitationJoinedSchema = z
  .object({ organizationSlug: z.string().min(1), accessToken: z.string().min(1), refreshToken: z.string().min(1) })
  .strip();
export type InvitationJoined = z.infer<typeof InvitationJoinedSchema>;
export const InvitationExchangeSchema = z.object({ token: z.string().min(1) }).strict();
export const InvitationAcceptSchema = z.object({ expectedRevision: RevisionSchema }).strict();
export const InvitationCreatePasswordSchema = InvitationAcceptSchema.extend({
  password: z.string().min(8).max(64),
}).strict();
export const InvitationPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8)
      .max(64)
      .refine((value) => {
        const characters = value.split('');

        return (
          characters.some((c) => /\p{L}/u.test(c) && /\p{Lowercase}/u.test(c)) &&
          characters.some((c) => /\p{L}/u.test(c) && /\p{Uppercase}/u.test(c)) &&
          characters.some((c) => /\p{Nd}/u.test(c)) &&
          characters.some((c) => /[^\p{L}\p{Nd}\p{Z}]/u.test(c))
        );
      }, 'auth.invitation.password_policy'),
    confirmation: z.string(),
  })
  .refine((value) => value.password === value.confirmation, {
    path: ['confirmation'],
    message: 'auth.invitation.password_confirmation_error',
  });

export const InvitationSamlStartSchema = z
  .object({
    samlRequest: z.string().min(1),
    ssoUrl: z
      .string()
      .url()
      .refine((url) => {
        try {
          return ['https:', 'http:'].includes(new URL(url).protocol);
        } catch {
          return false;
        }
      }),
  })
  .strip();
export type InvitationSamlStart = z.infer<typeof InvitationSamlStartSchema>;
