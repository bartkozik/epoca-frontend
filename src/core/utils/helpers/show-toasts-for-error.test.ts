import { addToast } from '@/core/providers/toastProvider';
import type { MockedFunction } from 'vitest';
import { showToastForError } from './show-toasts-for-error';

vi.mock('@/core/providers/toastProvider', () => ({ addToast: vi.fn() }));

const addToastMock = addToast as MockedFunction<typeof addToast>;

const axiosError = (status: number): Error =>
  ({
    config: {},
    isAxiosError: true,
    message: 'request failed',
    name: 'AxiosError',
    response: {
      config: { headers: { 'Correlation-Id': 'correlation-1' } },
      data: {},
      headers: {},
      status,
      statusText: 'failed',
    },
    toJSON: () => ({}),
  }) as unknown as Error;

describe('showToastForError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the default message when the HTTP status has no dedicated message', () => {
    showToastForError({ error: axiosError(500), errorMessageMap: { default: 'Workspace request failed' } });

    expect(addToastMock).toHaveBeenCalledWith({
      content: 'Workspace request failed',
      correlationId: 'correlation-1',
      type: 'error',
    });
  });

  it('keeps a dedicated status message when one exists', () => {
    showToastForError({
      error: axiosError(401),
      errorMessageMap: { 401: 'Not authorized', default: 'Request failed' },
    });

    expect(addToastMock).toHaveBeenCalledWith({
      content: 'Not authorized',
      correlationId: 'correlation-1',
      type: 'error',
    });
  });

  it('silently no-ops for a non-axios error value without throwing', () => {
    expect(() =>
      showToastForError({ error: 'not an error object', errorMessageMap: { default: 'Request failed' } }),
    ).not.toThrow();

    expect(addToastMock).not.toHaveBeenCalled();
  });
});
