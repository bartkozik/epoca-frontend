import { z } from 'zod';
import { InvitationUpdateSchema } from './invitationUpdate.model';

export const InvitationResendSchema = InvitationUpdateSchema;
export type InvitationResend = z.infer<typeof InvitationResendSchema>;
