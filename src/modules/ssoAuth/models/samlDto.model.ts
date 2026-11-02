import { InvitationContinuationSchema } from '@/core/models/invitationContinuation.model';
import { Language } from '@/core/models/types';
import { z } from 'zod';

export const SamlAuthCheckSchema = z.object({
  samlRequest: z.string().catch(''),
  ssoUrl: z.string().catch(''),
});

export type SamlAuthCheck = z.infer<typeof SamlAuthCheckSchema>;

// Tolerant only on fields the Authentication form does not edit. The editable fields must
// remain valid so a malformed response cannot silently populate the form with wrong values.
export const RawSamlConfigSchema = z.object({
  allowAccountInit: z.boolean(),
  createdAt: z.string().catch(''),
  idpCert: z.string(),
  idpEntityId: z.string(),
  idpSsoUrl: z.string(),
  isEnabled: z.boolean(),
  langCode: z.nativeEnum(Language).catch(Language.English),
  organizationId: z.string().catch(''),
  validFor: z.string(),
});

export type RawSamlConfig = z.infer<typeof RawSamlConfigSchema>;

export const SamlConfigUpdateRequestSchema = z.object({
  allowAccountInit: z.boolean(),
  idpCert: z.string(),
  idpEntityId: z.string(),
  idpSsoUrl: z.string(),
  isEnabled: z.boolean(),
  langCode: z.nativeEnum(Language),
  validFor: z.string(),
});

export type SamlConfigUpdateRequest = z.infer<typeof SamlConfigUpdateRequestSchema>;

export const SamlLoginBodySchema = z.object({ token: z.string() });

export const SamlLoginResponseSchema = z.union([
  InvitationContinuationSchema,
  z.object({ accessToken: z.string(), refreshToken: z.string() }).strip(),
]);

export type SamlLoginResponse = z.infer<typeof SamlLoginResponseSchema>;
