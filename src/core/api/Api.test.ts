import type { Mock } from 'vitest';
import { getRefreshedAccessToken } from './tokenRefresh';

vi.mock('axios', async () => ({
  ...(await vi.importActual('axios')),
  __esModule: true,
  default: {
    ...(await vi.importActual<{ default: object }>('axios')).default,
    create: vi.fn(),
  },
}));

export {};

vi.mock('./tokenRefresh', () => ({ getRefreshedAccessToken: vi.fn() }));

vi.mock('@/core/config/env', () => ({
  __esModule: true,
  default: { backendUrl: '/api/v1' },
}));

vi.mock('uuid', () => ({ v4: vi.fn() }));

const { mockDecodeSessionFromToken } = vi.hoisted(() => ({ mockDecodeSessionFromToken: vi.fn() }));

vi.mock('./utils', () => ({
  decodeSessionFromToken: mockDecodeSessionFromToken,
  getDeviceId: vi.fn(),
  getRefreshToken: vi.fn(),
  handleConnectionError: vi.fn(),
  isAccessTokenValid: vi.fn(),
  readStoredSession: vi.fn(() => ({ status: 'absent' })),
  removeAPICredentials: vi.fn(),
  sendErrorLogToServer: vi.fn(),
}));

vi.mock('./responseError', () => ({
  shouldSendResponseErrorLog: vi.fn(),
}));

vi.mock('@/core/utils/helpers', () => ({
  isAxiosError: vi.fn(),
  getCorrelationIdFromError: vi.fn(),
}));

const mockRequestUse = vi.fn();
const mockResponseUse = vi.fn();
const mockApi = {
  interceptors: {
    request: { use: mockRequestUse },
    response: { use: mockResponseUse },
  },
};

let mockCreate: Mock;
let MockAxiosHeaders: typeof import('axios').AxiosHeaders;
let mockGetRefreshedAccessToken: Mock;
let mockReadStoredSession: Mock;
let mockGetRefreshToken: Mock;
let mockGetDeviceId: Mock;
let mockIsAccessTokenValid: Mock;
let mockSendErrorLogToServer: Mock;
let mockRemoveAPICredentials: Mock;
let mockHandleConnectionError: Mock;
let mockUuid: Mock;
let mockShouldSendResponseErrorLog: Mock;
let mockIsAxiosError: Mock;
let mockGetCorrelationIdFromError: Mock;
let mockCreateConfig: { baseURL: string; paramsSerializer: (params: Record<string, unknown>) => string };
let mockRequestInterceptor: (config: Record<string, unknown>) => Promise<{ headers: Record<string, string> }>;
let mockResponseSuccessInterceptor: (response: unknown) => Promise<unknown>;
let mockResponseErrorInterceptor: (error: unknown) => Promise<never>;

const invokeResponseErrorInterceptor = (error: unknown): Promise<never> => {
  let rejection: Promise<never> | undefined;

  expect(() => {
    rejection = mockResponseErrorInterceptor(error);
  }).not.toThrow();
  expect(rejection).toBeDefined();

  return rejection as Promise<never>;
};

describe('Api', () => {
  beforeAll(async () => {
    const mockAxios = (await import('axios')) as unknown as {
      default: { create: Mock };
      AxiosHeaders: typeof import('axios').AxiosHeaders;
    };
    mockCreate = mockAxios.default.create;
    MockAxiosHeaders = mockAxios.AxiosHeaders;
    mockGetRefreshedAccessToken = getRefreshedAccessToken as Mock;
    const utilsMocks = (await import('./utils')) as unknown as Record<string, Mock>;
    mockReadStoredSession = utilsMocks.readStoredSession;
    mockGetRefreshToken = utilsMocks.getRefreshToken;
    mockGetDeviceId = utilsMocks.getDeviceId;
    mockIsAccessTokenValid = utilsMocks.isAccessTokenValid;
    mockSendErrorLogToServer = utilsMocks.sendErrorLogToServer;
    mockRemoveAPICredentials = utilsMocks.removeAPICredentials;
    mockHandleConnectionError = utilsMocks.handleConnectionError;
    const uuidMocks = (await import('uuid')) as unknown as Record<string, Mock>;
    mockUuid = uuidMocks.v4;
    const responseErrorMocks = (await import('./responseError')) as unknown as Record<string, Mock>;
    mockShouldSendResponseErrorLog = responseErrorMocks.shouldSendResponseErrorLog;
    const helpersMocks = (await import('@/core/utils/helpers')) as unknown as Record<string, Mock>;
    mockIsAxiosError = helpersMocks.isAxiosError;
    mockGetCorrelationIdFromError = helpersMocks.getCorrelationIdFromError;

    mockCreate.mockReturnValue(mockApi);
    await import('./Api');
    const createCall = mockCreate.mock.calls[0] as unknown as [typeof mockCreateConfig];
    mockCreateConfig = createCall[0];
    mockRequestInterceptor = mockRequestUse.mock.calls[0][0] as typeof mockRequestInterceptor;
    mockResponseSuccessInterceptor = mockResponseUse.mock.calls[0][0] as typeof mockResponseSuccessInterceptor;
    mockResponseErrorInterceptor = mockResponseUse.mock.calls[0][1] as typeof mockResponseErrorInterceptor;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRefreshedAccessToken.mockResolvedValue('fresh-token');
    mockReadStoredSession.mockReturnValue({ status: 'absent' });
    mockGetRefreshToken.mockReturnValue(null);
    mockGetDeviceId.mockReturnValue('device-1');
    mockUuid.mockReturnValue('correlation-1');
    mockIsAccessTokenValid.mockReturnValue(false);
    mockShouldSendResponseErrorLog.mockReturnValue(true);
    mockIsAxiosError.mockReturnValue(true);
    mockGetCorrelationIdFromError.mockReturnValue('correlation-1');
  });

  it('creates the shared API with its base URL and repeat-array query serialization', () => {
    expect(mockCreateConfig.baseURL).toBe('/api/v1');
    expect(mockCreateConfig.paramsSerializer({ ids: ['one', 'two'] })).toBe('ids=one&ids=two');
    expect(mockRequestInterceptor).toEqual(expect.any(Function));
    expect(mockResponseSuccessInterceptor).toEqual(expect.any(Function));
  });

  it('preserves request headers and adds valid access credentials', async () => {
    mockReadStoredSession.mockReturnValue({
      status: 'valid',
      session: { token: 'access-token', user: { exp: 1 } },
    });
    mockIsAccessTokenValid.mockReturnValue(true);
    const existingHeaders = new MockAxiosHeaders({ Existing: 'header' });

    const resolvedConfig = await mockRequestInterceptor({ url: '/work-units', headers: existingHeaders });
    const resolvedHeaders = resolvedConfig.headers as unknown as { get: (name: string) => string | undefined };

    expect(resolvedHeaders).toBeInstanceOf(MockAxiosHeaders);
    expect(resolvedHeaders.get('Existing')).toBe('header');
    expect(resolvedHeaders.get('device-id')).toBe('device-1');
    expect(resolvedHeaders.get('Correlation-Id')).toBe('correlation-1');
    expect(resolvedHeaders.get('Authorization')).toBe('Bearer access-token');
    expect(existingHeaders.get('device-id')).toBeUndefined();
    expect(existingHeaders.get('Correlation-Id')).toBeUndefined();
    expect(existingHeaders.get('Authorization')).toBeUndefined();
  });

  it('adds device and correlation headers without authorization when no credentials exist', async () => {
    await expect(mockRequestInterceptor({ url: '/public', headers: { Existing: 'header' } })).resolves.toMatchObject({
      headers: {
        Existing: 'header',
        'device-id': 'device-1',
        'Correlation-Id': 'correlation-1',
      },
    });

    const resolvedConfig = await mockRequestInterceptor({ headers: {} });
    expect(resolvedConfig.headers).not.toHaveProperty('Authorization');
  });

  it('reports and clears an unreadable stored session, so the next request does not re-report it', async () => {
    mockReadStoredSession.mockReturnValue({ status: 'unreadable', reason: 'invalid-shape' });

    await mockRequestInterceptor({ headers: {} });

    expect(mockSendErrorLogToServer).toHaveBeenCalledWith('correlation-1', 'Unreadable stored session: invalid-shape');
    expect(mockRemoveAPICredentials).toHaveBeenCalledTimes(1);
  });

  it('refreshes an expired access request and resolves it with the fresh token', async () => {
    mockReadStoredSession.mockReturnValue({
      status: 'valid',
      session: { token: 'expired-token', user: { exp: 0 } },
    });
    mockGetRefreshToken.mockReturnValue('refresh-token');
    const request = mockRequestInterceptor({ headers: { Existing: 'header' } });

    expect(mockGetRefreshedAccessToken).toHaveBeenCalledWith('refresh-token');
    await expect(request).resolves.toMatchObject({
      headers: {
        Existing: 'header',
        'device-id': 'device-1',
        'Correlation-Id': 'correlation-1',
        Authorization: 'Bearer fresh-token',
      },
    });
  });

  it('does not refresh again or replace the Bearer token for the refresh request', async () => {
    mockReadStoredSession.mockReturnValue({
      status: 'valid',
      session: { token: 'expired-token', user: { exp: 0 } },
    });
    mockGetRefreshToken.mockReturnValue('refresh-token');

    const resolvedConfig = await mockRequestInterceptor({
      url: '/auth/refresh-token',
      headers: { Authorization: 'Bearer refresh-token' },
    });
    const resolvedHeaders = resolvedConfig.headers as unknown as { get: (name: string) => string | undefined };

    expect(resolvedHeaders.get('Authorization')).toBe('Bearer refresh-token');
    expect(resolvedHeaders.get('device-id')).toBe('device-1');
    expect(resolvedHeaders.get('Correlation-Id')).toBe('correlation-1');
    expect(mockGetRefreshedAccessToken).not.toHaveBeenCalled();
    expect(mockReadStoredSession).not.toHaveBeenCalled();
    expect(mockGetRefreshToken).not.toHaveBeenCalled();
  });

  it('uses the explicit session without reading or refreshing a different stored account', async () => {
    const session = { token: 'selected-token', user: { exp: 4102444800 } };
    mockDecodeSessionFromToken.mockReturnValue(session);
    mockIsAccessTokenValid.mockReturnValue(true);
    mockReadStoredSession.mockReturnValue({ status: 'valid', session: { token: 'other-account' } });
    mockGetRefreshToken.mockReturnValue('other-refresh');
    const existingHeaders = new MockAxiosHeaders({ Authorization: 'Bearer inherited-token', 'X-CSRF-Token': 'csrf' });
    const config = await mockRequestInterceptor({
      url: '/invitation-access',
      authPolicy: { mode: 'explicit', token: 'selected-token' },
      headers: existingHeaders,
    });
    const headers = config.headers as unknown as InstanceType<typeof MockAxiosHeaders>;
    expect(headers.get('Authorization')).toBe('Bearer selected-token');
    expect(headers.get('X-CSRF-Token')).toBe('csrf');
    expect(headers.get('device-id')).toBe('device-1');
    expect(headers.get('Correlation-Id')).toBe('correlation-1');
    expect(existingHeaders.get('Authorization')).toBe('Bearer inherited-token');
    expect(mockDecodeSessionFromToken).toHaveBeenCalledWith('selected-token');
    expect(mockIsAccessTokenValid).toHaveBeenCalledWith(session);
    expect(mockReadStoredSession).not.toHaveBeenCalled();
    expect(mockGetRefreshToken).not.toHaveBeenCalled();
    expect(mockGetRefreshedAccessToken).not.toHaveBeenCalled();
  });

  it.each([null, 'invalid-token', 'expired-token'])(
    'sends an explicit request anonymously for %s, ignoring inherited headers and stored credentials',
    async (token) => {
      mockDecodeSessionFromToken.mockReturnValue(token === 'expired-token' ? { token, user: { exp: 1 } } : null);
      mockReadStoredSession.mockReturnValue({ status: 'unreadable', reason: 'invalid-shape' });
      mockGetRefreshToken.mockReturnValue('stored-refresh');
      const config = await mockRequestInterceptor({
        url: '/invitation-access/exchange',
        authPolicy: { mode: 'explicit', token },
        auth: { username: 'inherited-user', password: 'inherited-password' },
        headers: { Authorization: 'Bearer inherited-token' },
      });
      const headers = config.headers as unknown as InstanceType<typeof MockAxiosHeaders>;
      expect(headers.get('Authorization')).toBeUndefined();
      expect(config).not.toHaveProperty('auth');
      expect(headers.get('device-id')).toBe('device-1');
      expect(headers.get('Correlation-Id')).toBe('correlation-1');
      expect(mockReadStoredSession).not.toHaveBeenCalled();
      expect(mockGetRefreshToken).not.toHaveBeenCalled();
      expect(mockGetRefreshedAccessToken).not.toHaveBeenCalled();
      expect(mockSendErrorLogToServer).not.toHaveBeenCalled();
      expect(mockRemoveAPICredentials).not.toHaveBeenCalled();
    },
  );

  it('rejects an expired request when refreshing the session fails', async () => {
    mockReadStoredSession.mockReturnValue({
      status: 'valid',
      session: { token: 'expired-token', user: { exp: 0 } },
    });
    mockGetRefreshToken.mockReturnValue('refresh-token');
    const sessionEnded = new Error('session ended');
    mockGetRefreshedAccessToken.mockRejectedValueOnce(sessionEnded);
    const request = mockRequestInterceptor({ headers: {} });

    await expect(request).rejects.toBe(sessionEnded);
  });

  it('passes successful responses through unchanged', async () => {
    const response = { data: { id: 'work-unit-1' } };

    await expect(mockResponseSuccessInterceptor(response)).resolves.toBe(response);
  });

  it('logs eligible Axios response errors and rethrows the original error', async () => {
    const error = Object.assign(new Error('mock axios error'), { response: { data: 'server error' } });

    await expect(mockResponseErrorInterceptor(error)).rejects.toBe(error);

    expect(mockShouldSendResponseErrorLog).toHaveBeenCalledWith(error);
    expect(mockSendErrorLogToServer).toHaveBeenCalledWith('correlation-1', 'server error');
    expect(mockHandleConnectionError).toHaveBeenCalledWith(error);
  });

  it('passes eligible structured response errors to telemetry unchanged and rethrows the original error', async () => {
    const responseData = { title: 'failed', status: 500 };
    const error = Object.assign(new Error('mock axios error'), { response: { data: responseData } });

    await expect(mockResponseErrorInterceptor(error)).rejects.toBe(error);

    expect(mockSendErrorLogToServer).toHaveBeenCalledWith('correlation-1', responseData);
    expect(mockHandleConnectionError).toHaveBeenCalledWith(error);
  });

  it.each([
    ['excluded URL', true, { data: 'server error' }, false],
    ['non-Axios error', false, { data: 'server error' }, false],
    ['Axios error without a response', true, undefined, true],
  ])('does not log a %s but still handles and rejects it', async (_label, axiosError, response, logEligible) => {
    const error = Object.assign(new Error('mock axios error'), { response });
    mockShouldSendResponseErrorLog.mockReturnValue(logEligible);
    mockIsAxiosError.mockReturnValue(axiosError);

    await expect(mockResponseErrorInterceptor(error)).rejects.toBe(error);

    expect(mockSendErrorLogToServer).not.toHaveBeenCalled();
    expect(mockHandleConnectionError).toHaveBeenCalledWith(error);
  });

  it('decides whether telemetry is allowed before accessing an excluded response body', async () => {
    const response = {} as { data?: unknown };
    const readResponseBody = vi.fn(() => {
      throw new Error('excluded response body was accessed');
    });
    Object.defineProperty(response, 'data', { get: readResponseBody });
    const error = Object.assign(new Error('mock axios error'), { response });
    mockShouldSendResponseErrorLog.mockReturnValue(false);

    let rejectedError: unknown;
    try {
      await mockResponseErrorInterceptor(error);
    } catch (caught) {
      rejectedError = caught;
    }

    expect(rejectedError).toBe(error);
    expect(mockShouldSendResponseErrorLog).toHaveBeenCalledTimes(1);
    expect(mockShouldSendResponseErrorLog.mock.calls[0][0]).toBe(error);
    expect(readResponseBody).not.toHaveBeenCalled();
    expect(mockSendErrorLogToServer).not.toHaveBeenCalled();
    expect(mockHandleConnectionError).toHaveBeenCalledTimes(1);
    expect(mockHandleConnectionError.mock.calls[0][0]).toBe(error);
  });

  it('rejects the original error when classification throws synchronously', async () => {
    const response = {} as { data?: unknown };
    const readResponseBody = vi.fn();
    Object.defineProperty(response, 'data', { get: readResponseBody });
    const error = Object.assign(new Error('mock axios error'), { response });
    mockShouldSendResponseErrorLog.mockImplementationOnce(() => {
      throw new Error('classification side effect failed');
    });

    await expect(invokeResponseErrorInterceptor(error)).rejects.toBe(error);

    expect(readResponseBody).not.toHaveBeenCalled();
    expect(mockSendErrorLogToServer).not.toHaveBeenCalled();
    expect(mockHandleConnectionError).toHaveBeenCalledWith(error);
  });

  it('rejects the original error when correlation extraction throws synchronously', async () => {
    const error = Object.assign(new Error('mock axios error'), { response: { data: 'server error' } });
    mockGetCorrelationIdFromError.mockImplementationOnce(() => {
      throw new Error('correlation side effect failed');
    });

    await expect(invokeResponseErrorInterceptor(error)).rejects.toBe(error);

    expect(mockSendErrorLogToServer).not.toHaveBeenCalled();
    expect(mockHandleConnectionError).toHaveBeenCalledWith(error);
  });

  it('rejects the original error when an eligible response body getter throws synchronously', async () => {
    const response = {} as { data?: unknown };
    Object.defineProperty(response, 'data', {
      get: () => {
        throw new Error('response body side effect failed');
      },
    });
    const error = Object.assign(new Error('mock axios error'), { response });

    await expect(invokeResponseErrorInterceptor(error)).rejects.toBe(error);

    expect(mockSendErrorLogToServer).not.toHaveBeenCalled();
    expect(mockHandleConnectionError).toHaveBeenCalledTimes(1);
    expect(mockHandleConnectionError.mock.calls[0][0]).toBe(error);
  });

  it('rejects the original error when telemetry dispatch throws synchronously', async () => {
    const error = Object.assign(new Error('mock axios error'), { response: { data: 'server error' } });
    mockSendErrorLogToServer.mockImplementationOnce(() => {
      throw new Error('telemetry dispatch failed');
    });

    await expect(invokeResponseErrorInterceptor(error)).rejects.toBe(error);

    expect(mockSendErrorLogToServer).toHaveBeenCalledWith('correlation-1', 'server error');
    expect(mockHandleConnectionError).toHaveBeenCalledWith(error);
  });

  it('observes a rejected telemetry dispatch while rejecting the original error', async () => {
    const error = Object.assign(new Error('mock axios error'), { response: { data: 'server error' } });
    const telemetryFailure = Promise.reject(new Error('async telemetry dispatch failed'));
    const catchSpy = vi.spyOn(telemetryFailure, 'catch');
    telemetryFailure.catch(() => undefined);
    mockSendErrorLogToServer.mockReturnValueOnce(telemetryFailure);

    await expect(invokeResponseErrorInterceptor(error)).rejects.toBe(error);
    await Promise.resolve();

    expect(catchSpy).toHaveBeenCalledTimes(2);
    expect(mockHandleConnectionError).toHaveBeenCalledWith(error);
  });

  it('leaves connection error toasts to callers that opt out, while preserving the rejection', async () => {
    const error = Object.assign(new Error('Network Error'), { config: { skipConnectionErrorToast: true } });

    await expect(invokeResponseErrorInterceptor(error)).rejects.toBe(error);

    expect(mockHandleConnectionError).not.toHaveBeenCalled();
  });

  it('rejects the original error when connection handling throws synchronously', async () => {
    const error = Object.assign(new Error('mock axios error'), { response: { data: 'server error' } });
    mockHandleConnectionError.mockImplementationOnce(() => {
      throw new Error('connection side effect failed');
    });

    await expect(invokeResponseErrorInterceptor(error)).rejects.toBe(error);

    expect(mockSendErrorLogToServer).toHaveBeenCalledWith('correlation-1', 'server error');
    expect(mockHandleConnectionError).toHaveBeenCalledWith(error);
  });

  describe('reads the stored session per request, not from a cache', () => {
    it('calls readStoredSession again for a second request even when the first request already read it', async () => {
      mockReadStoredSession.mockReturnValue({ status: 'absent' });
      mockGetRefreshToken.mockReturnValue(null);

      await mockRequestInterceptor({ headers: {} });
      await mockRequestInterceptor({ headers: {} });

      expect(mockReadStoredSession).toHaveBeenCalledTimes(2);
    });
  });
});
