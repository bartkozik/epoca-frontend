import { LoginSchema } from './login.model';

describe('LoginSchema', () => {
  it.each(['simple', 'Pass word_with~other(special)chars', 'żółć', 'x'])(
    'accepts any non-empty password (%s)',
    (password) => {
      const result = LoginSchema.safeParse({ email: 'person@example.com', password });
      expect(result.success).toBe(true);
    },
  );

  it('rejects an empty password with the required-field key', () => {
    const result = LoginSchema.safeParse({ email: 'person@example.com', password: '' });
    if (result.success) throw new Error('expected validation to fail');
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0].path).toEqual(['password']);
    expect(result.error.issues[0].message).toBe('auth.login.form.error.password_required');
  });

  it('trims the email and keeps the password untouched', () => {
    const result = LoginSchema.safeParse({ email: '  person@example.com \t', password: ' secret ' });
    if (!result.success) throw new Error('expected validation to pass');
    expect(result.data).toEqual({ email: 'person@example.com', password: ' secret ' });
  });

  it('rejects an invalid email', () => {
    const result = LoginSchema.safeParse({ email: 'not-an-email', password: 'secret' });
    if (result.success) throw new Error('expected validation to fail');
    expect(result.error.issues[0].message).toBe('auth.login.form.error.email_not_valid');
  });
});
