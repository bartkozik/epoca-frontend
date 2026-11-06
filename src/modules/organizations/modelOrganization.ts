import { Organization, RawOrganization } from '@/modules/organizations/types';

export const toOrganization = (raw: RawOrganization): Organization => ({
  ...raw,
  users: [],
  archived: !!raw.archivedAt,
});
