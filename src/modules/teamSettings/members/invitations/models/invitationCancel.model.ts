import { z } from 'zod';
import { InvitationRevisionSchema } from './invitationRevision.model';

export const InvitationCancelSchema = z.object({ expectedRevision: InvitationRevisionSchema }).strict();
export type InvitationCancel = z.infer<typeof InvitationCancelSchema>;
