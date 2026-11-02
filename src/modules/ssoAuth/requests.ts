import api from '@/core/api';
import {
  RawSamlConfigSchema,
  SamlAuthCheckSchema,
  SamlConfigUpdateRequestSchema,
  SamlLoginBodySchema,
  SamlLoginResponseSchema,
  type RawSamlConfig,
  type SamlAuthCheck,
  type SamlConfigUpdateRequest,
  type SamlLoginResponse,
} from './models/samlDto.model';

export async function fetchSamlAuthCheck(organizationSlug: string): Promise<SamlAuthCheck> {
  const response = await api.get<unknown>(`/organizations/${organizationSlug}/saml/authn`, {
    skipConnectionErrorToast: true,
    withCredentials: true,
  });

  return SamlAuthCheckSchema.parse(response.data);
}

export async function fetchSamlConfig(organizationSlug: string): Promise<RawSamlConfig> {
  const response = await api.get<unknown>(`/organizations/${organizationSlug}/saml/configs`);

  return RawSamlConfigSchema.parse(response.data);
}

export async function updateSamlConfig(
  organizationSlug: string,
  input: SamlConfigUpdateRequest,
): Promise<RawSamlConfig> {
  const body = SamlConfigUpdateRequestSchema.parse(input);
  const response = await api.post<unknown>(`/organizations/${organizationSlug}/saml/configs`, body);

  return RawSamlConfigSchema.parse(response.data);
}

export async function samlLogin(organizationSlug: string, token: string): Promise<SamlLoginResponse> {
  const body = SamlLoginBodySchema.parse({ token });
  const response = await api.post<unknown>(`/organizations/${encodeURIComponent(organizationSlug)}/saml/login`, body, {
    withCredentials: true,
  });

  return SamlLoginResponseSchema.parse(response.data);
}
