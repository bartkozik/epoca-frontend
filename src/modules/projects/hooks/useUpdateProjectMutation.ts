import { useClients } from '@/modules/clients/ClientsProvider';
import { clientProjectsQueryKey } from '@/modules/clients/queryKeys';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { projectQueryKey } from '@/modules/projects/queryKeys';
import * as requests from '@/modules/projects/requests';
import { EditProjectArgs, ProjectPatchResult } from '@/modules/projects/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

export type UpdateProjectInput = Omit<EditProjectArgs, 'organizationSlug'>;

export function useUpdateProjectMutation(): UseMutationResult<ProjectPatchResult, unknown, UpdateProjectInput> {
  const { client, fetchClientProjects } = useClients();
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateProjectInput) =>
      requests.editProject({ organizationSlug, ...input }).then((response) => response.data),
    onSuccess: (data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['projects'], exact: false });
      void queryClient.invalidateQueries({
        queryKey: projectQueryKey(organizationSlug, variables.projectId),
        exact: false,
      });

      if (client && client.id === data.clientId) {
        void queryClient.invalidateQueries({
          queryKey: clientProjectsQueryKey(organizationSlug, client.id),
          exact: false,
        });
        void fetchClientProjects(client.id);
      }
    },
  });
}
