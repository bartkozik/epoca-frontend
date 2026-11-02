import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { getReportedUnits } from '@/modules/reports/hooks/useReportedUnits';
import * as requests from '@/modules/workingTime/requests';
import { UnitEditDto } from '@/modules/workingTime/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

export interface EditUnitInput {
  workUnitId: string;
  dto: UnitEditDto;
  shouldFinalize: boolean;
  idempotencyKey: string;
}

export function useEditUnitMutation(): UseMutationResult<void, unknown, EditUnitInput> {
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ workUnitId, dto, shouldFinalize, idempotencyKey }: EditUnitInput) =>
      requests.editUnit(organizationSlug, workUnitId, dto, shouldFinalize, idempotencyKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['units'], exact: false });
      // Refresh the report query after edits made from either view.
      void getReportedUnits();
    },
  });
}
