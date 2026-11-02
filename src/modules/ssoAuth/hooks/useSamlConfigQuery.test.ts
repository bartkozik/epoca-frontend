import api from '@/core/api';
import { Language } from '@/core/models/types';
import { resolveSsoOrganizationSlug } from '@/modules/ssoAuth/hooks/useSamlConfigQuery';
import { RawSamlConfigSchema } from '@/modules/ssoAuth/models/samlDto.model';
import { fetchSamlConfig } from '@/modules/ssoAuth/requests';
import type { MockedFunction } from 'vitest';

vi.mock('@/core/api', () => ({
  __esModule: true,
  default: { get: vi.fn() },
}));

// The request boundary, schema and slug resolver are under test.
// eslint-disable-next-line vitest/unbound-method -- api.get is a vi.fn() mock, see vi.mock above.
const getMock = api.get as MockedFunction<typeof api.get>;

const validRawSamlConfig = {
  allowAccountInit: true,
  createdAt: '2026-01-01T00:00:00Z',
  idpCert: 'cert',
  idpEntityId: 'entity-id',
  idpSsoUrl: 'https://idp.example.com/sso',
  isEnabled: true,
  langCode: Language.Polish,
  organizationId: 'org-1',
  validFor: 'PT1H',
};

describe('resolveSsoOrganizationSlug', () => {
  it('falls back to the temporary hardcoded slug when the context organization slug is empty', () => {
    expect(resolveSsoOrganizationSlug('')).toBe('iterators');
  });

  it('uses the given slug when one is resolved', () => {
    expect(resolveSsoOrganizationSlug('acme')).toBe('acme');
  });
});

describe('RawSamlConfigSchema', () => {
  it('parses a well-formed response', () => {
    expect(RawSamlConfigSchema.parse(validRawSamlConfig)).toEqual(validRawSamlConfig);
  });

  it('tolerates an unrecognized langCode by falling back to English rather than throwing', () => {
    const result = RawSamlConfigSchema.parse({ ...validRawSamlConfig, langCode: 'de' });

    expect(result.langCode).toBe(Language.English);
  });

  it('tolerates a missing createdAt/organizationId (non-load-bearing fields)', () => {
    const { createdAt, organizationId, ...rest } = validRawSamlConfig;
    void createdAt;
    void organizationId;

    const result = RawSamlConfigSchema.parse(rest);

    expect(result.createdAt).toBe('');
    expect(result.organizationId).toBe('');
  });

  it('still throws when a form-editable field is malformed', () => {
    expect(() => RawSamlConfigSchema.parse({ ...validRawSamlConfig, idpCert: null })).toThrow();
  });
});

describe('fetchSamlConfig', () => {
  it('requests the given organization slug and parses the response', async () => {
    getMock.mockResolvedValueOnce({ data: validRawSamlConfig });

    const result = await fetchSamlConfig('acme');

    expect(getMock).toHaveBeenCalledWith('/organizations/acme/saml/configs');
    expect(result).toEqual(validRawSamlConfig);
  });

  it('rejects a malformed editable field at the request boundary', async () => {
    getMock.mockResolvedValueOnce({ data: { ...validRawSamlConfig, idpCert: null } });

    await expect(fetchSamlConfig('acme')).rejects.toThrow();
  });
});
