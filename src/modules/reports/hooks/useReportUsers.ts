import { toOrganizationUser } from '@/modules/organizations/modelOrganizationUser';
import * as organizationRequests from '@/modules/organizations/requests';
import type { OrganizationUser } from '@/modules/organizations/types';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { reportUsersQueryKey } from '@/modules/reports/queryKeys';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

/**
 * People to name and filter in reports: the workspace members plus members whose membership was archived,
 * because their entries stay in reports. Until those load (or when the backend doesn't send them), this is
 * the workspace list.
 */
export function useReportUsers(): OrganizationUser[] {
  const { contextOrganizationSlug, contextOrganizationUsers } = useWorkspace();
  const membersQuery = useQuery({
    queryKey: reportUsersQueryKey(contextOrganizationSlug),
    queryFn: () =>
      organizationRequests.getOrganizationUsers(contextOrganizationSlug, true, true).then((response) => response.data),
    enabled: contextOrganizationSlug !== '',
  });

  return useMemo(() => {
    const known = new Set(contextOrganizationUsers.map(({ id }) => id));
    const archivedMembers = (membersQuery.data ?? [])
      .filter(({ id }) => !known.has(id))
      .map((raw) => ({ ...toOrganizationUser(raw), archived: true }));
    return archivedMembers.length === 0 ? contextOrganizationUsers : [...contextOrganizationUsers, ...archivedMembers];
  }, [contextOrganizationUsers, membersQuery.data]);
}
