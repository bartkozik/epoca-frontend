import { clientQueryKey } from '@/modules/clients/queryKeys';
import * as requests from '@/modules/clients/requests';
import { RawClient } from '@/modules/clients/types';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export function useClientQuery(clientId: string | undefined): UseQueryResult<RawClient | undefined> {
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;

  return useQuery({
    queryKey: clientQueryKey(organizationSlug, clientId ?? ''),
    queryFn: () =>
      requests.getClient(organizationSlug, clientId as string).then((response) => response.data.results[0]),
    enabled: clientId !== undefined,
  });
}
