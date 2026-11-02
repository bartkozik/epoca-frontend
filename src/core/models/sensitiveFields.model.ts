import { z } from 'zod';

export const SensitiveFieldsShape = {
  clientSecret: z.never().optional(),
  secretHash: z.never().optional(),
  accessToken: z.never().optional(),
  authorization: z.never().optional(),
};
