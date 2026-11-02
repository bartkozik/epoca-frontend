import { z } from 'zod';

export const InvitationRevisionSchema = z.string().regex(/^(0|[1-9]\d*)$/);
