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

      // Must run before fetchClientProjects below -- it's what invalidates clientProjectsQueryKey,
      // without which the fetchQuery call there would just return the pre-mutation cached list.
      invalidateClientProjects(organizationSlug, variables.clientId);

      // client.projects doesn't refresh from the invalidations above -- fetchClientProjects is only
      // ever called imperatively on mount -- so force it when it's the client being viewed.
      if (client && client.id === variables.clientId) void fetchClientProjects(client.id);
    },
  });
}
