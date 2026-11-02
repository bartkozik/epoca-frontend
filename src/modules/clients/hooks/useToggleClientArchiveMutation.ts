import { clientQueryKey } from '@/modules/clients/queryKeys';
import * as requests from '@/modules/clients/requests';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

export interface ToggleClientArchiveInput {
  clientId: string;
  isCurrentlyArchived: boolean;
}

// Shared by both call sites (ClientsBoard, ClientDetailsForm) so the archive/unarchive direction
// is computed in one place. `isCurrentlyArchived` is the PRE-request state, so `archive_success`/
// `archive_failed` describe an archive attempt (isCurrentlyArchived: false) and
// `unarchive_success`/`unarchive_failed` describe an unarchive attempt (isCurrentlyArchived: true)
// -- the same direction for both outcomes, since it names the attempted action, not its result.
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
