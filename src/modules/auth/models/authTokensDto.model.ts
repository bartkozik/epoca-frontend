import { z } from 'zod';

// Shared response shape for both /auth/login and /auth/refresh-token -- tolerant parsing since
// the backend can add fields additively and this repo's convention treats every API response
// boundary in requests.ts as untrusted until parsed.
export const AuthTokensSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
  })
  .passthrough();

export type AuthTokens = z.infer<typeof AuthTokensSchema>;
