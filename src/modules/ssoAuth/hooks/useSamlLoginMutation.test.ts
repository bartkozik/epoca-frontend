import api from '@/core/api';
import { samlLogin } from '@/modules/ssoAuth/requests';
import type { MockedFunction } from 'vitest';

vi.mock('@/core/api', () => ({
  __esModule: true,
  default: { post: vi.fn() },
}));

// eslint-disable-next-line vitest/unbound-method
const postMock = api.post as MockedFunction<typeof api.post>;

describe('samlLogin', () => {
  it('posts the token to the given organization slug and parses the response', async () => {
    postMock.mockResolvedValueOnce({ data: { accessToken: 'access-1', refreshToken: 'refresh-1' } });

    const result = await samlLogin('acme', 'saml-token');

    expect(postMock).toHaveBeenCalledWith(
      '/organizations/acme/saml/login',
      { token: 'saml-token' },
      { withCredentials: true },
    );
    expect(result).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  it('percent-encodes a slug containing path-traversal characters instead of interpolating it raw', async () => {
    postMock.mockResolvedValueOnce({ data: { accessToken: 'access-1', refreshToken: 'refresh-1' } });

    await samlLogin('../other-org', 'saml-token');

    expect(postMock).toHaveBeenCalledWith(
      '/organizations/..%2Fother-org/saml/login',
      { token: 'saml-token' },
      { withCredentials: true },
    );
  });

  it('throws when the response does not match the expected shape', async () => {
    postMock.mockResolvedValueOnce({ data: { accessToken: 'access-1' } });

    await expect(samlLogin('acme', 'saml-token')).rejects.toThrow();
  });
});

it('parses an invitation continuation without exposing tokens or financial fields', async () => {
  postMock.mockResolvedValueOnce({
    data: {
      kind: 'invitation',
      organizationSlug: 'target',
      nextAction: 'Accept',
      csrfToken: 'secret',
      hourlyRate: 100,
    },
  });
  expect(await samlLogin('acme', 'saml-token')).toEqual({
    kind: 'invitation',
    organizationSlug: 'target',
    nextAction: 'Accept',
  });
});
