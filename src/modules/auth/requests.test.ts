import type { Mock } from 'vitest';

vi.mock('axios', () => ({
  __esModule: true,
  default: { delete: vi.fn(), post: vi.fn() },
}));

export {};

vi.mock('@/core/api', () => ({
  __esModule: true,
  default: { post: vi.fn(), delete: vi.fn() },
  getDeviceId: vi.fn(),
}));

vi.mock('@/core/config/env', () => ({
  __esModule: true,
  default: { backendUrl: '/api/v1' },
}));

let mockPost: Mock;
let mockDelete: Mock;
let mockApiPost: Mock;
let mockApiDelete: Mock;
let mockGetDeviceId: Mock;
let invalidateRefreshToken: typeof import('./requests').invalidateRefreshToken;
let login: typeof import('./requests').login;
let loginWithRefreshToken: typeof import('./requests').loginWithRefreshToken;

beforeAll(async () => {
  const mockAxios = (await import('axios')) as unknown as { default: { post: Mock; delete: Mock } };
  mockPost = mockAxios.default.post;
  mockDelete = mockAxios.default.delete;
  const mockApi = (await import('@/core/api')) as unknown as {
    default: { post: Mock; delete: Mock };
    getDeviceId: Mock;
  };
  mockApiPost = mockApi.default.post;
  mockApiDelete = mockApi.default.delete;
  mockGetDeviceId = mockApi.getDeviceId;
  ({ invalidateRefreshToken, login, loginWithRefreshToken } = await import('./requests'));
});

describe('auth requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDeviceId.mockReturnValue('device-1');
  });

  it('sends login credentials through the shared API and returns the parsed tokens', async () => {
    mockApiPost.mockResolvedValue({ data: { accessToken: 'access-token', refreshToken: 'refresh-token' } });

    await expect(login('person@example.com', 'secret')).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(mockApiPost).toHaveBeenCalledWith('/auth/login', { email: 'person@example.com', password: 'secret' });
  });

  it('refreshes a token through the shared Axios client with its own credentials', async () => {
    mockApiPost.mockResolvedValue({ data: { accessToken: 'fresh-access-token', refreshToken: 'fresh-refresh-token' } });

    await expect(loginWithRefreshToken('refresh-token')).resolves.toEqual({
      accessToken: 'fresh-access-token',
      refreshToken: 'fresh-refresh-token',
    });
    expect(mockApiPost).toHaveBeenCalledWith(
      '/auth/refresh-token',
      { refreshTokenJwt: 'refresh-token' },
      { headers: { Authorization: 'Bearer refresh-token' }, skipConnectionErrorToast: true },
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('invalidates with a snapshotted access token outside the refresh interceptor', () => {
    void invalidateRefreshToken('access-token', 'device-1');

    expect(mockDelete).toHaveBeenCalledWith('/api/v1/auth/refresh-tokens/device-1', {
      headers: {
        Authorization: 'Bearer access-token',
        'device-id': 'device-1',
      },
    });
    expect(mockApiDelete).not.toHaveBeenCalled();
  });
});
