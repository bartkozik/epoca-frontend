import { z } from 'zod';

export const AuthTokensSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
  })
  .passthrough();

export type AuthTokens = z.infer<typeof AuthTokensSchema>;
