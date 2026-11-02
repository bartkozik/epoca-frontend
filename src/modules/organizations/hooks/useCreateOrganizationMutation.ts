import { useAuth } from '@/modules/auth/AuthProvider';
import type { OrganizationCreateRequest } from '@/modules/organizations/models/organizationCreate.model';
import { organizationsQueryKey } from '@/modules/organizations/queryKeys';
import * as requests from '@/modules/organizations/requests';
import { RawOrganization } from '@/modules/organizations/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

export function useCreateOrganizationMutation(): UseMutationResult<
  RawOrganization,
  unknown,
  OrganizationCreateRequest
> {
  const auth = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, slug }: OrganizationCreateRequest) =>
      requests.addNewOrganization(name, slug).then((response) => response.data),
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: organizationsQueryKey(), exact: false });
      await auth.refreshAfterPermissionGrant();
    },
  });
}
