import { useClients } from '@/modules/clients/ClientsProvider';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import { evictPivotTableCache } from '@/modules/reports/hooks/usePivotTableQuery';
import { evictWorkUnitOverrideHistoryCache } from '@/modules/reports/workUnitOverrideHistoryQueries';
import { evictWorkUnitOverrideCache } from '@/modules/reports/workUnitOverrideQueries';
import { removeAllUnits } from '@/modules/workingTime/UnitWorkspaceProvider';

export const useCheckoutFromWorkspace = (): (() => void) => {
  const { removeAllClients } = useClients();
  const projectsContext = useProjects();

  const workspace = useWorkspace();

  return (): void => {
    removeAllClients();
    projectsContext.removeAllProjects();
    removeAllUnits();
    evictWorkUnitOverrideCache();
    evictWorkUnitOverrideHistoryCache();
    evictPivotTableCache();
    workspace.resetContextOrganizationId();
  };
};
