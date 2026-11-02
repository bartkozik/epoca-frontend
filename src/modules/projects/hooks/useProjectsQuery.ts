import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { projectsQueryKey } from '@/modules/projects/queryKeys';
import * as requests from '@/modules/projects/requests';
import { FetchProjectsDto, RawProjectResults } from '@/modules/projects/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export function useProjectsQuery(): UseQueryResult<RawProjectResults> {
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const dto: FetchProjectsDto = { organizationSlug, includeArchived: true };

  return useProjectsListQuery(dto);
}

export function useProjectsListQuery(dto: FetchProjectsDto, enabled?: boolean): UseQueryResult<RawProjectResults> {
  return useQuery({
    enabled,
    queryKey: projectsQueryKey(dto),
    queryFn: () => requests.getProjects(dto).then((response) => response.data),
  });
}
