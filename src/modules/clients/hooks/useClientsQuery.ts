import { clientsQueryKey } from '@/modules/clients/queryKeys';
import * as requests from '@/modules/clients/requests';
import type { FetchClientsDto } from '@/modules/clients/types';
import { RawClientResults } from '@/modules/clients/types';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export function useClientsQuery(): UseQueryResult<RawClientResults> {
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const dto = { organizationSlug, includeArchived: true, includeArchivedConnections: true };

  return useClientsListQuery(dto);
}

export function useClientsListQuery(dto: FetchClientsDto, enabled?: boolean): UseQueryResult<RawClientResults> {
  return useQuery({
    enabled,
    queryKey: clientsQueryKey(dto),
    queryFn: () => requests.getClients(dto).then((response) => response.data),
  });
}
