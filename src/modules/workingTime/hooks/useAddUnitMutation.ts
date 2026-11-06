import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import * as requests from '@/modules/workingTime/requests';
import { RawUnit, UnitDto } from '@/modules/workingTime/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

export interface AddUnitInput {
  dto: UnitDto;
  isDraft: boolean;
  idempotencyKey: string;
}

export function useAddUnitMutation(): UseMutationResult<RawUnit, unknown, AddUnitInput> {
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dto, isDraft, idempotencyKey }: AddUnitInput) =>
      requests.addUnit(organizationSlug, dto, isDraft, idempotencyKey).then((response) => response.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['units'], exact: false });
    },
  });
}
