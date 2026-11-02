import { addToast } from '@/core/providers/toastProvider';
import type { MockedFunction } from 'vitest';
import { showModuleErrorToast } from './show-module-error-toast';

vi.mock('@/core/providers/toastProvider', () => ({ addToast: vi.fn() }));

const addToastMock = addToast as MockedFunction<typeof addToast>;

const axiosError = (status: number): Error =>
  ({
    config: {},
    isAxiosError: true,
    message: 'request failed',
    name: 'AxiosError',
    response: { config: {}, data: {}, headers: {}, status, statusText: 'failed' },
    toJSON: () => ({}),
  }) as unknown as Error;

describe('showModuleErrorToast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to showToastForError for a genuine AxiosError', () => {
    showModuleErrorToast(axiosError(404), { 404: 'Not found', default: 'Request failed' });

    expect(addToastMock).toHaveBeenCalledWith(expect.objectContaining({ content: 'Not found' }));
  });

  // This is the exact case showToastForError itself silently drops (see its own test: "silently
  // no-ops for a non-axios error value without throwing") -- a ZodError from response validation
  // is not an AxiosError, so without this fallback the user would see nothing at all.
  it('falls back to the default message for a non-axios error instead of staying silent', () => {
    showModuleErrorToast(new TypeError('unexpected shape'), { default: 'Something went wrong' });

    expect(addToastMock).toHaveBeenCalledWith({ content: 'Something went wrong', type: 'error' });
  });

  it('logs a non-axios error to the console, since the toast alone carries no trace of what broke', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new TypeError('unexpected shape');

    showModuleErrorToast(error, { default: 'Something went wrong' });

    expect(consoleErrorSpy).toHaveBeenCalledWith(error);
    consoleErrorSpy.mockRestore();
  });
});
