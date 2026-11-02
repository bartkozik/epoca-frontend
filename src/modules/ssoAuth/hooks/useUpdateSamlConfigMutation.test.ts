import api from '@/core/api';
import { Language } from '@/core/models/types';
import { SamlConfigUpdateRequestSchema } from '@/modules/ssoAuth/models/samlDto.model';
import { updateSamlConfig } from '@/modules/ssoAuth/requests';
import type { MockedFunction } from 'vitest';

vi.mock('@/core/api', () => ({
  __esModule: true,
  default: { post: vi.fn() },
}));

// The request boundary and input schema are under test here.
// eslint-disable-next-line vitest/unbound-method -- api.post is a vi.fn() mock, see vi.mock above.
const postMock = api.post as MockedFunction<typeof api.post>;

const validRequest = {
  allowAccountInit: true,
  idpCert: 'cert',
  idpEntityId: 'entity-id',
  idpSsoUrl: 'https://idp.example.com/sso',
  isEnabled: true,
  langCode: Language.Polish,
  validFor: 'PT1H',
};

const rawSamlConfigResponse = {
  ...validRequest,
  createdAt: '2026-01-01T00:00:00Z',
  organizationId: 'org-1',
};

describe('SamlConfigUpdateRequestSchema', () => {
  it('parses a well-formed request body', () => {
    expect(SamlConfigUpdateRequestSchema.parse(validRequest)).toEqual(validRequest);
  });

  it('throws on a malformed langCode -- this is our own draft state, not third-party wire data', () => {
    expect(() => SamlConfigUpdateRequestSchema.parse({ ...validRequest, langCode: 'de' })).toThrow();
  });
});

describe('updateSamlConfig', () => {
  it('posts the validated body to the given organization slug and parses the response', async () => {
    postMock.mockResolvedValueOnce({ data: rawSamlConfigResponse });

    const result = await updateSamlConfig('acme', validRequest);

    expect(postMock).toHaveBeenCalledWith('/organizations/acme/saml/configs', validRequest);
    expect(result).toEqual(rawSamlConfigResponse);
  });

  it('rejects a malformed response after the update', async () => {
    postMock.mockResolvedValueOnce({ data: { ...rawSamlConfigResponse, idpCert: null } });

    await expect(updateSamlConfig('acme', validRequest)).rejects.toThrow();
  });
});
