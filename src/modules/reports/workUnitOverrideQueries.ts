import { queryClient } from '@/core/api/queryClient';
import type { WorkUnitOverrideResponse } from '@/modules/reports/models/workUnitOverride.model';
import { getWorkUnitOverride } from '@/modules/reports/report/workUnitOverride/requests';

export const evictWorkUnitOverrideCache = (): void => {
  queryClient.removeQueries({ queryKey: ['workUnitOverride'], exact: false });
};

// No useQuery export: useWorkUnitOverride.ts has no passive subscriber -- every load is triggered
// explicitly (session open, conflict reconciliation, manual retry), so the cache is driven
// imperatively via queryClient.fetchQuery. Add a useQuery wrapper if a passive reader appears.
export function fetchWorkUnitOverride(organizationSlug: string, workUnitId: string): Promise<WorkUnitOverrideResponse> {
  return getWorkUnitOverride(organizationSlug, workUnitId).then((response) => response.data);
}
