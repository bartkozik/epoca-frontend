import { z } from 'zod';
import { InvitationCreateSchema } from './invitationCreate.model';
import { InvitationRevisionSchema } from './invitationRevision.model';

export const InvitationUpdateSchema = InvitationCreateSchema.omit({ email: true })
  .partial()
  .extend({ expectedRevision: InvitationRevisionSchema })
  .strict();
export type InvitationUpdate = z.infer<typeof InvitationUpdateSchema>;
