import { invalidateClientProjects } from '@/modules/clients/clientCache';
import { useClients } from '@/modules/clients/ClientsProvider';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import * as requests from '@/modules/projects/requests';
import { AddProjectArgs, RawProject } from '@/modules/projects/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

export type CreateProjectInput = Omit<AddProjectArgs, 'organizationSlug'>;

export function useCreateProjectMutation(): UseMutationResult<RawProject, unknown, CreateProjectInput> {
  const { client, fetchClientProjects } = useClients();
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      requests.addNewProject({ organizationSlug, ...input }).then((response) => response.data),
    onSuccess: (data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['projects'], exact: false });

      invalidateClientProjects(organizationSlug, variables.clientId);

      if (client && client.id === variables.clientId) void fetchClientProjects(client.id);
    },
  });
}
