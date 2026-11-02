import { organizationQueryKey, organizationsQueryKey } from '@/modules/organizations/queryKeys';
import * as requests from '@/modules/organizations/requests';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

export interface DeleteOrganizationInput {
  slug: string;
}

export function useDeleteOrganizationMutation(): UseMutationResult<void, unknown, DeleteOrganizationInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ slug }: DeleteOrganizationInput) => requests.deleteOrganization(slug).then(() => undefined),
    onSuccess: (_data, { slug }) => {
      void queryClient.invalidateQueries({ queryKey: organizationsQueryKey(), exact: false });
      void queryClient.invalidateQueries({ queryKey: organizationQueryKey(slug), exact: false });
    },
  });
}
