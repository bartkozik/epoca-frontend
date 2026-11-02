import type { Mock } from 'vitest';

// Unlike Api.test.ts, `./utils` (and therefore `./requests`) is deliberately left unmocked here:
// these tests exist specifically to exercise the real sendErrorLogToServer -> requests.sendErrorLog
// call chain, and the real request interceptor that triggers it, that a mocked
// sendErrorLogToServer/readStoredSession would hide. Only the true boundaries -- the axios
// instances themselves and env are mocked.

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
    // Api.ts calls axios.create() twice, in order: `api` first, `errorLoggingApi` second.
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

    // If this ever posted through `api` instead, the request would re-enter api's own request
    // interceptor, which would detect the same unreadable stored session again and call
    // sendErrorLogToServer again -- an unbounded loop of requests. This assertion is what would
    // have caught that regression; a mocked sendErrorLogToServer (as in Api.test.ts) cannot.
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("api's own request interceptor reports an unreadable stored session exactly once, without looping back into itself", async () => {
    // A corrupt (non-JSON) stored credential is exactly the condition the interceptor checks for
    // (readStoredSession().status === 'unreadable') before calling sendErrorLogToServer -- driving
    // the real interceptor end-to-end, rather than calling sendErrorLogToServer directly, also
    // pins that the interceptor's own conditional still fires the report at all.
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

    // Without clearing the credential, this second (unrelated) request would still see the same
    // corrupt value and report it again -- and again on every request after that, indefinitely.
    await requestInterceptor({ headers: {} });
    expect(errorLoggingPost).toHaveBeenCalledTimes(1);
  });
});
