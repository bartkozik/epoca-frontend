import type {
  ReplaceWorkUnitOverrideRequest,
  UndoWorkUnitOverrideRequest,
  WorkUnitOverrideResponse,
} from '@/modules/reports/models/workUnitOverride.model';
import { replaceWorkUnitOverride, undoWorkUnitOverride } from '@/modules/reports/report/workUnitOverride/requests';
import { useMutation, type UseMutationResult } from '@tanstack/react-query';

export interface ReplaceWorkUnitOverrideVariables {
  organizationSlug: string;
  workUnitId: string;
  dto: ReplaceWorkUnitOverrideRequest;
}

export interface UndoWorkUnitOverrideVariables {
  organizationSlug: string;
  workUnitId: string;
  dto: UndoWorkUnitOverrideRequest;
}

// Deliberately no onMutate/onSuccess/onError: useWorkUnitOverride.ts's own mutate() awaits the
// real response and handles the accept/conflict/terminal orchestration itself, exactly as it does
// with the raw request functions. These hooks stay pessimistic primitives.
export function useReplaceWorkUnitOverrideMutation(): UseMutationResult<
  WorkUnitOverrideResponse,
  unknown,
  ReplaceWorkUnitOverrideVariables
> {
  return useMutation({
    mutationFn: ({ organizationSlug, workUnitId, dto }: ReplaceWorkUnitOverrideVariables) =>
      replaceWorkUnitOverride(organizationSlug, workUnitId, dto).then((response) => response.data),
  });
}

export function useUndoWorkUnitOverrideMutation(): UseMutationResult<
  WorkUnitOverrideResponse,
  unknown,
  UndoWorkUnitOverrideVariables
> {
  return useMutation({
    mutationFn: ({ organizationSlug, workUnitId, dto }: UndoWorkUnitOverrideVariables) =>
      undoWorkUnitOverride(organizationSlug, workUnitId, dto).then((response) => response.data),
  });
}
