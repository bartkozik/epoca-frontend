import { ProblemDetailSchema } from '@/core/models/problemDetail.model';
import { z } from 'zod';

export const InvitationAccessProblemCodeSchema = z.enum([
  'invalid-invitation',
  'forbidden',
  'identity-mismatch',
  'sign-in-required',
  'invalid-request',
  'rate-limited',
  'revision-conflict',
  'already-member',
  'identity-conflict',
  'invitation-conflict',
]);

export type InvitationAccessProblemCode = z.infer<typeof InvitationAccessProblemCodeSchema>;

export const InvitationAccessProblemSchema = ProblemDetailSchema.extend({ joined: z.unknown().optional() }).strip();
