import { clientProjectsQueryKey } from '@/modules/clients/queryKeys';
import * as requests from '@/modules/clients/requests';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export function useClientProjectsQuery(
  clientId: string,
  enabled: boolean,
): UseQueryResult<Awaited<ReturnType<typeof requests.getClientProjects>>['data']> {
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;

  return useQuery({
    queryKey: clientProjectsQueryKey(organizationSlug, clientId),
    queryFn: () => requests.getClientProjects(organizationSlug, clientId).then((response) => response.data),
    enabled,
  });
}
