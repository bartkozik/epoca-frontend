import { z } from 'zod';

// Resolve translation keys when displaying errors, not when this module is imported.
// Login accepts any non-empty password: password strength rules belong to the place where a
// password is set, and rejecting existing passwords here would lock their owners out.
export const LoginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'auth.login.form.error.email_to short')
    .email('auth.login.form.error.email_not_valid'),
  // Sign-in verifies existing credentials on the server; creation policy belongs to account setup.
  password: z.string().min(1, 'auth.login.form.error.password_required'),
});
