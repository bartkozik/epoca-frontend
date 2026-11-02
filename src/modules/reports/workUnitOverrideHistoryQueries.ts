import { queryClient } from '@/core/api/queryClient';
import type { WorkUnitOverrideHistoryPage } from '@/modules/reports/models/workUnitOverride.model';
import { getWorkUnitOverrideHistory } from '@/modules/reports/report/workUnitOverride/requests';

export const evictWorkUnitOverrideHistoryCache = (): void => {
  queryClient.removeQueries({ queryKey: ['workUnitOverrideHistory'], exact: false });
};

export function fetchWorkUnitOverrideHistoryPage(
  organizationSlug: string,
  workUnitId: string,
  upToVersion: number,
  pageNumber: number,
): Promise<WorkUnitOverrideHistoryPage> {
  return getWorkUnitOverrideHistory(organizationSlug, workUnitId, upToVersion, pageNumber).then(
    (response) => response.data,
  );
}
