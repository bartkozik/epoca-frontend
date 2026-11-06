import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { projectQueryKey } from '@/modules/projects/queryKeys';
import * as requests from '@/modules/projects/requests';
import { RawProject } from '@/modules/projects/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export function useProjectQuery(projectId: string | undefined): UseQueryResult<RawProject | undefined> {
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;

  return useQuery({
    queryKey: projectQueryKey(organizationSlug, projectId ?? ''),
    queryFn: () => requests.getProject(organizationSlug, projectId as string).then((response) => response.data),
    enabled: projectId !== undefined,
  });
}
