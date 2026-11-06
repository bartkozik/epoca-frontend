import type { Mock } from 'vitest';


vi.mock('axios', async () => ({
  ...(await vi.importActual('axios')),
  __esModule: true,
  default: {
    ...(await vi.importActual<{ default: object }>('axios')).default,
    create: vi.fn(),
  },
}));

vi.mock('@/core/config/env', () => ({
  __esModule: true,
  default: { backendUrl: '/api/v1' },
}));

const AUTH_STORAGE_KEY = 'IteratorsEpoca__auth__access_tok_localhost';

describe('error log telemetry does not loop back through api', () => {
  let apiPost: Mock;
  let errorLoggingPost: Mock;
  let requestInterceptor: (config: Record<string, unknown>) => Promise<unknown>;

  beforeAll(async () => {
    apiPost = vi.fn();
    const apiRequestUse = vi.fn();
    const apiInstance = {
      post: apiPost,
      interceptors: { request: { use: apiRequestUse }, response: { use: vi.fn() } },
    };
    errorLoggingPost = vi.fn().mockResolvedValue({ data: {} });
    const errorLoggingInstance = {
      post: errorLoggingPost,
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    };

    const mockAxios = (await import('axios')) as unknown as { default: { create: Mock } };
    mockAxios.default.create.mockReturnValueOnce(apiInstance).mockReturnValueOnce(errorLoggingInstance);

    await import('./Api');
    requestInterceptor = apiRequestUse.mock.calls[0][0] as typeof requestInterceptor;
  });

  afterEach(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    apiPost.mockClear();
    errorLoggingPost.mockClear();
  });

  it('sendErrorLogToServer posts through errorLoggingApi, never through the interceptor-bearing api instance', async () => {
    const { sendErrorLogToServer } = await import('./utils');

    await sendErrorLogToServer('correlation-1', 'Unreadable stored session: invalid-shape');

    expect(errorLoggingPost).toHaveBeenCalledTimes(1);
    const [url, body] = errorLoggingPost.mock.calls[0] as [string, unknown];
    expect(url).toBe('/metrics/frontend/error');
    expect(body).toEqual({
      payload: { id: 'correlation-1', errorMessage: 'Unreadable stored session: invalid-shape' },
    });

    expect(apiPost).not.toHaveBeenCalled();
  });

  it("api's own request interceptor reports an unreadable stored session exactly once, without looping back into itself", async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, 'not json at all');

    await requestInterceptor({ headers: {} });

    expect(errorLoggingPost).toHaveBeenCalledTimes(1);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('clears the corrupt credential after reporting it, so a second request does not report it again', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, 'not json at all');

    await requestInterceptor({ headers: {} });
    expect(errorLoggingPost).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();

    await requestInterceptor({ headers: {} });
    expect(errorLoggingPost).toHaveBeenCalledTimes(1);
  });
});
