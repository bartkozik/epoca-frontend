import { clientQueryKey } from '@/modules/clients/queryKeys';
import * as requests from '@/modules/clients/requests';
import { EditClientDto } from '@/modules/clients/types';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

export function useUpdateClientMutation(): UseMutationResult<void, unknown, EditClientDto> {
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: EditClientDto) => requests.editClient(organizationSlug, params),
    onSuccess: (_data, params) => {
      void queryClient.invalidateQueries({ queryKey: ['clients'], exact: false });
      void queryClient.invalidateQueries({
        queryKey: clientQueryKey(organizationSlug, params.clientId),
        exact: false,
      });
    },
  });
}
