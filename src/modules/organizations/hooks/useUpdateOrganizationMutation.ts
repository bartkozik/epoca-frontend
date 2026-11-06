import type { OrganizationUpdateRequest } from '@/modules/organizations/models/organizationUpdate.model';
import { organizationQueryKey, organizationsQueryKey } from '@/modules/organizations/queryKeys';
import * as requests from '@/modules/organizations/requests';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

export interface UpdateOrganizationInput extends OrganizationUpdateRequest {
  slug: string;
}

export function useUpdateOrganizationMutation(): UseMutationResult<void, unknown, UpdateOrganizationInput> {
  const workspace = useWorkspace();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ slug, name }: UpdateOrganizationInput) => requests.editOrganization(slug, name),
    onSuccess: (_data, { slug }) => {
      void queryClient.invalidateQueries({ queryKey: organizationsQueryKey(), exact: false });
      void queryClient.invalidateQueries({ queryKey: organizationQueryKey(slug), exact: false });
      if (slug === workspace.contextOrganizationSlug) {
        void workspace.getContextOrganizationBySlug(slug).catch(() => undefined);
      }
    },
  });
}
