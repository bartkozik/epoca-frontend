import { filterNonNullItems } from '@/core/utils/helpers';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { modelUnit } from '@/modules/workingTime/modelUnit';
import { unitsQueryKey } from '@/modules/workingTime/queryKeys';
import * as requests from '@/modules/workingTime/requests';
import { RawUnitResults, Unit, UnitsDto } from '@/modules/workingTime/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

// Cache holds the raw, unmodeled RawUnitResults -- mirrors useClientsQuery returning RawClientResults,
// not a UI-modeled shape. Modeling/sequencing lives in selectModeledUnits below, kept separate so
// callers can select it with whatever contextOrganizationUsers snapshot they currently have.
export function useUnitsQuery(dto: UnitsDto, options?: { enabled?: boolean }): UseQueryResult<RawUnitResults> {
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;

  return useQuery({
    queryKey: unitsQueryKey(organizationSlug, dto),
    queryFn: () => requests.getUnits(organizationSlug, dto).then((response) => response.data),
    enabled: options?.enabled,
  });
}

export function selectModeledUnits(
  data: RawUnitResults | undefined,
  contextOrganizationUsers: Parameters<typeof modelUnit>[1],
): Unit[] {
  if (!data) return [];

  const validUnits = filterNonNullItems(data.workUnits.results, 'projectClient');
  const mappedUnits = validUnits.map((raw, index) => modelUnit(raw, contextOrganizationUsers, index));

  let updatedUnits = [...mappedUnits];

  if (data.orders && data.orders.length > 0) {
    data.orders.forEach((order) => {
      order.ids.forEach((id, index) => {
        const unitIndex = updatedUnits.findIndex((unit) => unit.id === id);
        if (unitIndex !== -1) {
          updatedUnits[unitIndex] = {
            ...updatedUnits[unitIndex],
            date: order.date,
            sequenceIndex: index,
          };
        }
      });
    });

    updatedUnits.sort((a, b) => {
      const dateComparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateComparison !== 0) return dateComparison;

      return a.sequenceIndex - b.sequenceIndex;
    });
  } else {
    updatedUnits = updatedUnits.map((unit, index) => ({ ...unit, sequenceIndex: index }));
  }

  return updatedUnits;
}
