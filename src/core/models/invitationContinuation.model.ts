import { z } from 'zod';
import { InvitationNextActionSchema } from './invitationNextAction.model';

export const InvitationContinuationSchema = z
  .object({
    kind: z.literal('invitation'),
    organizationSlug: z.string(),
    nextAction: InvitationNextActionSchema,
  })
  .strip();

export type InvitationContinuation = z.infer<typeof InvitationContinuationSchema>;
