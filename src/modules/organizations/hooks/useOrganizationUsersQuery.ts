import { organizationUsersQueryKey } from '@/modules/organizations/queryKeys';
import * as requests from '@/modules/organizations/requests';
import { RawOrganizationUser } from '@/modules/organizations/types';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export function useOrganizationUsersQuery(includeArchived = true): UseQueryResult<RawOrganizationUser[]> {
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;

  return useQuery({
    queryKey: organizationUsersQueryKey(organizationSlug, includeArchived),
    queryFn: () => requests.getOrganizationUsers(organizationSlug, includeArchived).then((response) => response.data),
    enabled: organizationSlug !== '',
  });
}
