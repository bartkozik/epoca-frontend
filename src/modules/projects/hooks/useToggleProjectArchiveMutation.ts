import { invalidateClientProjects } from '@/modules/clients/clientCache';
import { useClients } from '@/modules/clients/ClientsProvider';
import { clientProjectsQueryKey } from '@/modules/clients/queryKeys';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { projectQueryKey } from '@/modules/projects/queryKeys';
import * as requests from '@/modules/projects/requests';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

export interface ToggleProjectArchiveInput {
  projectId: string;
  isCurrentlyArchived: boolean;
  clientId: string;
}

export function getToggleProjectArchiveToastKey(isCurrentlyArchived: boolean, outcome: 'success' | 'failed'): string {
  const direction = isCurrentlyArchived ? 'unarchive' : 'archive';
  return `toast_message.projects.${direction}_${outcome}`;
}

export function useToggleProjectArchiveMutation(): UseMutationResult<void, unknown, ToggleProjectArchiveInput> {
  const { client, fetchClientProjects } = useClients();
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, isCurrentlyArchived }: ToggleProjectArchiveInput) =>
      isCurrentlyArchived
        ? requests.unarchiveProject(organizationSlug, projectId)
        : requests.archiveProject(organizationSlug, projectId),
    onSuccess: (_data, { projectId, isCurrentlyArchived, clientId }) => {
      void queryClient.invalidateQueries({ queryKey: ['projects'], exact: false });
      void queryClient.invalidateQueries({ queryKey: projectQueryKey(organizationSlug, projectId), exact: false });

      if (!isCurrentlyArchived) invalidateClientProjects(organizationSlug, clientId);

      if (client && client.id === clientId) {
        void queryClient.invalidateQueries({
          queryKey: clientProjectsQueryKey(organizationSlug, clientId),
          exact: false,
        });
        void fetchClientProjects(client.id);
      }
    },
  });
}
