import { DATE_FORMAT, formatDate } from '@/core/utils/helpers';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { selectModeledUnits } from '@/modules/workingTime/hooks/useUnitsQuery';
import { unitsQueryKey } from '@/modules/workingTime/queryKeys';
import * as requests from '@/modules/workingTime/requests';
import { RawUnitResults, Unit, UnitsDto } from '@/modules/workingTime/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import i18n from 'i18next';

export interface ReorderPlan {
  movedUnitId: string;
  formattedDate: string;
  orderedUnitIds: string[];
}

interface ReorderMutationContext {
  previousData: RawUnitResults | undefined;
}

const isSameCalendarDay = (unitDate: string, day: Date): boolean =>
  new Date(unitDate).toDateString() === day.toDateString();

export function computeMoveToDatePlan(units: Unit[], unitId: string, newDate: Date): ReorderPlan | null {
  if (!units.some((unit) => unit.id === unitId)) return null;

  const orderedUnitIds = units
    .filter((unit) => unit.id !== unitId && isSameCalendarDay(unit.date, newDate))
    .sort((a, b) => a.sequenceIndex - b.sequenceIndex)
    .map((unit) => unit.id)
    .concat(unitId);

  return { movedUnitId: unitId, formattedDate: formatDate(newDate, DATE_FORMAT.DAY_BE_FORMAT), orderedUnitIds };
}

export function computeAppendNewUnitPlan(units: Unit[], newUnitId: string, date: Date): ReorderPlan {
  const orderedUnitIds = units
    .filter((unit) => isSameCalendarDay(unit.date, date))
    .sort((a, b) => a.sequenceIndex - b.sequenceIndex)
    .map((unit) => unit.id)
    .concat(newUnitId);

  return { movedUnitId: newUnitId, formattedDate: formatDate(date, DATE_FORMAT.DAY_BE_FORMAT), orderedUnitIds };
}

export function computeReorderPlan(units: Unit[], activeId: string, overId: string): ReorderPlan | null {
  const activeUnit = units.find((unit) => unit.id === activeId);
  const overUnit = units.find((unit) => unit.id === overId);
  if (!activeUnit || !overUnit) return null;

  const overUnitDate = new Date(overUnit.date);
  const overUnitSequenceIndex = overUnit.sequenceIndex;

  const dayUnits = units
    .filter((unit) => unit.id !== activeId && isSameCalendarDay(unit.date, overUnitDate))
    .map((unit) => ({
      id: unit.id,
      sequenceIndex: unit.sequenceIndex >= overUnitSequenceIndex ? unit.sequenceIndex + 1 : unit.sequenceIndex,
    }))
    .concat({ id: activeId, sequenceIndex: overUnitSequenceIndex });

  return {
    movedUnitId: activeId,
    formattedDate: formatDate(overUnitDate, DATE_FORMAT.DAY_BE_FORMAT),
    orderedUnitIds: dayUnits.sort((a, b) => a.sequenceIndex - b.sequenceIndex).map((unit) => unit.id),
  };
}

export function applyReorderPlan(data: RawUnitResults, plan: ReorderPlan): RawUnitResults {
  const results = data.workUnits.results.map((raw) =>
    raw.id === plan.movedUnitId ? { ...raw, date: plan.formattedDate } : raw,
  );

  // Remove the moved ID from other days: last-write-wins ordering could otherwise put it back.
  const movedDateEntry = { date: plan.formattedDate, ids: plan.orderedUnitIds };
  const orders = data.orders
    .map((order) =>
      order.date === plan.formattedDate
        ? movedDateEntry
        : { ...order, ids: order.ids.filter((id) => id !== plan.movedUnitId) },
    )
    .filter((order) => order.ids.length > 0);

  if (!data.orders.some((order) => order.date === plan.formattedDate)) orders.push(movedDateEntry);

  return { ...data, workUnits: { ...data.workUnits, results }, orders };
}

type PlanFactory<TVariables> = (units: Unit[], variables: TVariables) => ReorderPlan | null;

function useReorderMutation<TVariables>(
  dto: UnitsDto,
  computePlan: PlanFactory<TVariables>,
): UseMutationResult<void, unknown, TVariables, ReorderMutationContext> {
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const contextOrganizationUsers = workspace.contextOrganizationUsers;
  const queryClient = useQueryClient();
  const queryKey = unitsQueryKey(organizationSlug, dto);

  const planFromCache = (variables: TVariables): ReorderPlan | null => {
    const data = queryClient.getQueryData<RawUnitResults>(queryKey);
    return computePlan(selectModeledUnits(data, contextOrganizationUsers), variables);
  };

  return useMutation<void, unknown, TVariables, ReorderMutationContext>({
    mutationFn: async (variables: TVariables) => {
      const plan = planFromCache(variables);
      if (!plan) throw new Error(i18n.t('toast_message.working_time.unit_not_found_error'));

      await requests.changeUnitsOrder(organizationSlug, plan.formattedDate, plan.orderedUnitIds);
      await requests.updateUnitDate(organizationSlug, plan.movedUnitId, plan.formattedDate);
    },
    onMutate: async (variables: TVariables) => {
      await queryClient.cancelQueries({ queryKey });

      const previousData = queryClient.getQueryData<RawUnitResults>(queryKey);
      const plan = computePlan(selectModeledUnits(previousData, contextOrganizationUsers), variables);
      if (previousData && plan) queryClient.setQueryData(queryKey, applyReorderPlan(previousData, plan));

      return { previousData };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousData) queryClient.setQueryData(queryKey, context.previousData);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey, exact: false });
    },
  });
}

export interface MoveUnitToDateInput {
  unitId: string;
  newDate: Date;
}

export function useMoveUnitToDateMutation(
  dto: UnitsDto,
): UseMutationResult<void, unknown, MoveUnitToDateInput, ReorderMutationContext> {
  return useReorderMutation(dto, (units, { unitId, newDate }: MoveUnitToDateInput) =>
    computeMoveToDatePlan(units, unitId, newDate),
  );
}

export interface ReorderUnitsInput {
  activeId: string;
  overId: string;
}

export function useReorderUnitsMutation(
  dto: UnitsDto,
): UseMutationResult<void, unknown, ReorderUnitsInput, ReorderMutationContext> {
  return useReorderMutation(dto, (units, { activeId, overId }: ReorderUnitsInput) =>
    computeReorderPlan(units, activeId, overId),
  );
}

export function useAppendNewUnitMutation(): UseMutationResult<void, unknown, ReorderPlan> {
  const { contextOrganizationSlug } = useWorkspace();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (plan: ReorderPlan) =>
      requests.changeUnitsOrder(contextOrganizationSlug, plan.formattedDate, plan.orderedUnitIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['units'], exact: false });
    },
  });
}
