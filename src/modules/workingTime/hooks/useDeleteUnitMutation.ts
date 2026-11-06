import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { getReportedUnits } from '@/modules/reports/hooks/useReportedUnits';
import * as requests from '@/modules/workingTime/requests';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

export interface DeleteUnitInput {
  workUnitId: string;
}

export function useDeleteUnitMutation(): UseMutationResult<void, unknown, DeleteUnitInput> {
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ workUnitId }: DeleteUnitInput) => requests.deleteUnit(organizationSlug, workUnitId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['units'], exact: false });
      void getReportedUnits();
    },
  });
}
