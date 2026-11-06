import { clientQueryKey } from '@/modules/clients/queryKeys';
import * as requests from '@/modules/clients/requests';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

export interface ToggleClientArchiveInput {
  clientId: string;
  isCurrentlyArchived: boolean;
}

export function getToggleClientArchiveToastKey(isCurrentlyArchived: boolean, outcome: 'success' | 'failed'): string {
  const direction = isCurrentlyArchived ? 'unarchive' : 'archive';
  return `toast_message.clients.${direction}_${outcome}`;
}

export function useToggleClientArchiveMutation(): UseMutationResult<void, unknown, ToggleClientArchiveInput> {
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ clientId, isCurrentlyArchived }: ToggleClientArchiveInput) =>
      (isCurrentlyArchived
        ? requests.unarchiveClient(organizationSlug, clientId)
        : requests.archiveClient(organizationSlug, clientId)
      ).then(() => undefined),
    onSuccess: (_data, { clientId }) => {
      void queryClient.invalidateQueries({ queryKey: ['clients'], exact: false });
      void queryClient.invalidateQueries({ queryKey: clientQueryKey(organizationSlug, clientId), exact: false });
    },
  });
}
