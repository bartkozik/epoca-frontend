// Separate from handle-validation-errors.test.ts, which mocks 'i18next' entirely -- that proves
// handleValidationErrors calls i18n.t(), but not that the real, app-initialized i18next instance
// actually resolves a key or falls back to an already-resolved sentence verbatim (the entire
// safety argument for touching this shared helper, see its own comment). This file imports the
// real @/core/i18n/i18n (triggering its .use().init() chain) unmocked, matching the pattern in
// core/i18n/i18n.test.ts.
import i18n from '@/core/i18n/i18n';
import { z } from 'zod';
import { formatValidationMessage, handleValidationErrors } from './handle-validation-errors';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('handleValidationErrors against the real i18next instance', () => {
  it('translates a real i18n key', () => {
    const schema = z.object({ email: z.string().min(1, 'common.error.name_is_already_in_use') });
    const result = schema.safeParse({ email: '' });
    if (result.success) throw new Error('expected validation to fail');

    expect(handleValidationErrors(result.error).email?.message).toBe('Name is already in use.');
  });

  it('translates the two clients.client_form.error keys added by CT-558', () => {
    const schema = z.object({
      clientName: z.string().min(1, 'clients.client_form.error.project_name_required').max(0, {
        message: 'clients.client_form.error.project_name_too_long',
      }),
    });
    const requiredResult = schema.safeParse({ clientName: '' });
    if (requiredResult.success) throw new Error('expected validation to fail');
    expect(handleValidationErrors(requiredResult.error).clientName?.message).toBe('Client name field is required.');

    const tooLongResult = schema.safeParse({ clientName: 'x' });
    if (tooLongResult.success) throw new Error('expected validation to fail');
    expect(handleValidationErrors(tooLongResult.error).clientName?.message).toBe('Client name is too long.');
  });

  it('interpolates params for the maximum-hours key added by CT-560, via formatValidationMessage', () => {
    const schema = z.object({
      duration: z.string().refine(() => false, {
        message: formatValidationMessage('working_time.calendar.unit_form.error.maximum_amount_of_hours_count', {
          hours: 5,
        }),
      }),
    });
    const result = schema.safeParse({ duration: '10' });
    if (result.success) throw new Error('expected validation to fail');

    expect(handleValidationErrors(result.error).duration?.message).toBe(
      'Maximum amount of hours available to report: 5',
    );
  });

  it('falls back verbatim for a message that is an already-resolved sentence, not a key', () => {
    const schema = z.object({ email: z.string().min(1, "Time can't be {weird} # stuff") });
    const result = schema.safeParse({ email: '' });
    if (result.success) throw new Error('expected validation to fail');

    expect(handleValidationErrors(result.error).email?.message).toBe("Time can't be {weird} # stuff");
  });
});
