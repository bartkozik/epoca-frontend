import { queryClient } from '@/core/api/queryClient';
import type { WorkUnitOverrideResponse } from '@/modules/reports/models/workUnitOverride.model';
import { getWorkUnitOverride } from '@/modules/reports/report/workUnitOverride/requests';

export const evictWorkUnitOverrideCache = (): void => {
  queryClient.removeQueries({ queryKey: ['workUnitOverride'], exact: false });
};

export function fetchWorkUnitOverride(organizationSlug: string, workUnitId: string): Promise<WorkUnitOverrideResponse> {
  return getWorkUnitOverride(organizationSlug, workUnitId).then((response) => response.data);
}
