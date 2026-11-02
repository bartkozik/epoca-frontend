export type { SamlAuthCheck } from '@/modules/ssoAuth/models/samlDto.model';

export const samlAuthCheckQueryKey = (organizationSlug: string): readonly [string, string] => [
  'samlAuthCheck',
  organizationSlug,
];

export type { RawSamlConfig } from '@/modules/ssoAuth/models/samlDto.model';

export const samlConfigQueryKey = (organizationSlug: string): readonly [string, string] => [
  'samlConfig',
  organizationSlug,
];
