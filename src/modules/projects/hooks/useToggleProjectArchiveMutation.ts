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

// isCurrentlyArchived is the PRE-request state, so archive_success/failed describes an archive
// attempt (isCurrentlyArchived: false) and unarchive_success/failed an unarchive attempt (true).
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

      // Only fires on archive, not unarchive -- mirrors updateClientsWhenAddingProject's own
      // asymmetry (pre-migration toggleArchiveFlag never handled the unarchive direction either).
      if (!isCurrentlyArchived) invalidateClientProjects(organizationSlug, clientId);

      // fetchClientProjects is only ever called imperatively (no reactive subscription), so force
      // it when it's the client currently being viewed. Invalidate unconditionally first --
      // updateClientsWhenRemovingProject above only invalidates on the archive direction, so
      // unarchive would otherwise hand back the pre-mutation cached list.
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
