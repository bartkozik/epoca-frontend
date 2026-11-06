import { FetchClientsDto } from '@/modules/clients/types';

export const clientQueryKey = (organizationSlug: string, clientId: string): readonly [string, string, string] => [
  'client',
  organizationSlug,
  clientId,
];

export const clientsQueryKey = (dto: FetchClientsDto): readonly [string, string] => ['clients', JSON.stringify(dto)];

export const clientProjectsQueryKey = (
  organizationSlug: string,
  clientId: string,
): readonly [string, string, string] => ['clientProjects', organizationSlug, clientId];
