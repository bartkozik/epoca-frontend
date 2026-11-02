import { FetchClientsDto } from '@/modules/clients/types';

export const clientQueryKey = (organizationSlug: string, clientId: string): readonly [string, string, string] => [
  'client',
  organizationSlug,
  clientId,
];

// Flat, entity-prefixed key (this repo's tanstackquery convention) -- 'clients' is the stable
// prefix every read/invalidation shares, with the dto JSON-stringified as the second segment since
// this is a parameterized list query. That's different from ssoAuth's samlConfigQueryKey, which is
// an unparameterized singleton query and so just returns plain string segments -- not a mismatch,
// just a simpler case.
export const clientsQueryKey = (dto: FetchClientsDto): readonly [string, string] => ['clients', JSON.stringify(dto)];

// Keyed on organizationSlug too (see clientQueryKey above for why) so cached
// projects can't outlive the org switch that invalidated them.
export const clientProjectsQueryKey = (
  organizationSlug: string,
  clientId: string,
): readonly [string, string, string] => ['clientProjects', organizationSlug, clientId];
