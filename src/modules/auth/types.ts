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
