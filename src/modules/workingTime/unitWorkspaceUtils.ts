import { queryClient } from '@/core/api/queryClient';
import { resetReportedUnitsForOrgSwitch } from '@/modules/reports/hooks/useReportedUnits';

export function removeAllUnits(): void {
  queryClient.removeQueries({ queryKey: ['units'] });
  resetReportedUnitsForOrgSwitch();
}
