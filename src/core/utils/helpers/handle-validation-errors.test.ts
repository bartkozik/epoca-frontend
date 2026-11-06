import i18n from 'i18next';
import { z } from 'zod';
import { formatValidationMessage, handleValidationErrors } from './handle-validation-errors';

vi.mock('i18next', () => ({
  __esModule: true,
  default: { t: vi.fn((key: string) => key) },
}));

const tMock = i18n.t as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.clearAllMocks();
});

describe('handleValidationErrors', () => {
  it('resolves each field error message through i18n.t', () => {
    tMock.mockImplementation((key: string) =>
      key === 'common.error.name_is_already_in_use' ? 'Name is already in use.' : key,
    );
    const schema = z.object({ email: z.string().min(1, 'common.error.name_is_already_in_use') });
    const result = schema.safeParse({ email: '' });
    if (result.success) throw new Error('expected validation to fail');

    const errors = handleValidationErrors(result.error);

    expect(tMock).toHaveBeenCalledWith('common.error.name_is_already_in_use');
    expect(errors.email?.message).toBe('Name is already in use.');
  });

  it('falls back to the message verbatim when it is not a translation key (i18next default missing-key behavior)', () => {
    const schema = z.object({ email: z.string().min(1, 'Email is required.') });
    const result = schema.safeParse({ email: '' });
    if (result.success) throw new Error('expected validation to fail');

    const errors = handleValidationErrors(result.error);

    expect(errors.email?.message).toBe('Email is required.');
  });

  it('resolves a formatValidationMessage payload through i18n.t with its params', () => {
    const schema = z.object({
      duration: z.string().refine(() => false, { message: formatValidationMessage('error.max_hours', { hours: 5 }) }),
    });
    const result = schema.safeParse({ duration: '10' });
    if (result.success) throw new Error('expected validation to fail');

    handleValidationErrors(result.error);

    expect(tMock).toHaveBeenCalledWith('error.max_hours', { hours: 5 });
  });

  it('falls back to a plain key when the message looks like JSON but carries no marker', () => {
    const schema = z.object({ email: z.string().min(1, '{"not":"a validation payload"}') });
    const result = schema.safeParse({ email: '' });
    if (result.success) throw new Error('expected validation to fail');

    const errors = handleValidationErrors(result.error);

    expect(tMock).toHaveBeenCalledWith('{"not":"a validation payload"}');
    expect(errors.email?.message).toBe('{"not":"a validation payload"}');
  });

  it('keys errors by each field name', () => {
    const schema = z.object({
      email: z.string().min(1, 'error.email'),
      url: z.string().url('error.url'),
    });
    const result = schema.safeParse({ email: '', url: 'not-a-url' });
    if (result.success) throw new Error('expected validation to fail');

    const errors = handleValidationErrors(result.error);

    expect(errors.email?.message).toBe('error.email');
    expect(errors.url?.message).toBe('error.url');
  });
});
