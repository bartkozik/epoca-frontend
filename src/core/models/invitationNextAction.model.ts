import { z } from 'zod';

export const InvitationNextActionSchema = z.enum(['CreateAccount', 'SignIn', 'Accept', 'VerifyLegacySso']);
