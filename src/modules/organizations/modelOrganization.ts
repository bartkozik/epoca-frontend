import { Organization, RawOrganization } from '@/modules/organizations/types';

// The RawOrganization -> Organization derivation both stores used to own privately
// (mapOrganization/modelContextOrganization), now shared. `users` stays [] -- nothing reads it off
// an Organization anywhere in the app (it was only ever fed back from a prior in-memory state),
// matching modelClient.ts's identical note for a client's `projects`.
export const toOrganization = (raw: RawOrganization): Organization => ({
  ...raw,
  users: [],
  archived: !!raw.archivedAt,
});
