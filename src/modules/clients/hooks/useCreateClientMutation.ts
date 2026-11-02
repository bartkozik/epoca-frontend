import * as requests from '@/modules/clients/requests';
import { ClientType, RawClient } from '@/modules/clients/types';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

export interface CreateClientInput {
  name: string;
  color: string;
  texture: string;
  logo: string;
  type: ClientType;
}

export function useCreateClientMutation(): UseMutationResult<RawClient, unknown, CreateClientInput> {
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, color, texture, logo, type }: CreateClientInput) =>
      requests.addNewClient(organizationSlug, name, color, texture, logo, type).then((response) => response.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['clients'], exact: false });
    },
  });
}
