// canonical definitions live in core/models/auth — core/api owns the access-token
// lifecycle (see core/api/utils.ts), so it can't just import this file. Re-exported below so
// every existing `from '@/modules/auth/types'` site keeps working unchanged.
import { QueuedAccessTokenRequest } from '@/core/models/auth';
import { LoginSchema } from '@/modules/auth/models/login.model';
import { z } from 'zod';

export type { QueuedAccessTokenRequest };

export type FormError = {
  message?: string;
};

export type LoginErrors = {
  [key in keyof z.infer<typeof LoginSchema>]?: FormError;
};

export interface UserLanguage {
  lang: string;
}
