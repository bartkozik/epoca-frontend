import { z } from 'zod';

export const LoginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'auth.login.form.error.email_to short')
    .email('auth.login.form.error.email_not_valid'),
  password: z.string().min(1, 'auth.login.form.error.password_required'),
});
