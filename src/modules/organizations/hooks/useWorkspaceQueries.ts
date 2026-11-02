import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { toOrganization } from '../modelOrganization';
import { organizationQueryKey, organizationUserProjectsQueryKey, organizationUsersQueryKey } from '../queryKeys';
import * as requests from '../requests';
import type { Organization, OrganizationUserProject, RawOrganizationUser } from '../types';

export function useWorkspaceQueries(
  slug: string,
  userId: string,
  enabled: boolean,
): {
  organizationQuery: UseQueryResult<Organization>;
  usersQuery: UseQueryResult<RawOrganizationUser[]>;
  userProjectsQuery: UseQueryResult<OrganizationUserProject[]>;
} {
  const organizationQuery = useQuery({
    queryKey: organizationQueryKey(slug),
    queryFn: () => requests.getOrganizationBySlug(slug).then((response) => toOrganization(response.data)),
    enabled,
  });
  const usersQuery = useQuery({
    queryKey: organizationUsersQueryKey(slug, true),
    queryFn: () => requests.getOrganizationUsers(slug, true).then((response) => response.data),
    enabled,
  });
  const userProjectsQuery = useQuery({
    queryKey: organizationUserProjectsQueryKey(slug, userId),
    queryFn: () => requests.getOrganizationUserProjects(slug, userId).then((response) => response.data),
    enabled,
  });
  return { organizationQuery, usersQuery, userProjectsQuery };
}
