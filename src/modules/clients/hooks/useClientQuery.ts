import { clientQueryKey } from '@/modules/clients/queryKeys';
import * as requests from '@/modules/clients/requests';
import { RawClient } from '@/modules/clients/types';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

// getClient hits the same /clients list endpoint with an `id` filter (there is no dedicated
// GET-by-id route on the backend -- confirmed against ClientRouter.scala, which only exposes
// POST/GET-list/PATCH), so this unwraps the single result from that list response.
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
