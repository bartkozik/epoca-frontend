import { SelectOption } from '@/core/theme/inputs';
import { createSearchOptions } from '@/core/utils/helpers';
import { useClients } from '@/modules/clients/ClientsProvider';
import { OrganizationUserRole } from '@/modules/organizations/types';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import { useReportUsers } from '@/modules/reports/hooks/useReportUsers';
import { useCallback, useMemo, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { ReportDateRangeNavigationMode, ReportDateRangeSnapshot } from './reportDateRange';
import { SelectedItemsMap } from './types';

export interface ReportFilters {
  navigationMode: ReportDateRangeNavigationMode;
  selectedClients: SelectedItemsMap;
  selectedProjects: SelectedItemsMap;
  selectedUsers: SelectedItemsMap;
  selectedFromDate: Dayjs;
  selectedToDate: Dayjs | null;
  clientsSearchOptions: SelectOption[];
  contextOrganizationUserSearchOptions: SelectOption[];
  projectsSearchOptions: SelectOption[];
  areAllProjectsSelected: boolean;
  areAllUsersSelected: boolean;
  areAllClientsSelected: boolean;
  updatedSelectedProjectsKeys: string[];
  updatedSelectedClientsKeys: string[];
  updatedSelectedUsersKeys: string[];
  setSelectedDateRange: (snapshot: ReportDateRangeSnapshot) => void;
  setSelectedProjects: (projects: SelectedItemsMap) => void;
  setSelectedUsers: (users: SelectedItemsMap) => void;
  setSelectedClients: (clients: SelectedItemsMap) => void;
  setSelectedFilters: (args: {
    clients: SelectedItemsMap;
    projects: SelectedItemsMap;
    users: SelectedItemsMap;
  }) => void;
}

const areAllIdsSelected = (itemIds: string[], selectedItemsMap: SelectedItemsMap): boolean => {
  const availableIds = new Set(itemIds);
  const selectedIds = Object.keys(selectedItemsMap);
  return (
    availableIds.size > 0 && selectedIds.length === availableIds.size && selectedIds.every((id) => availableIds.has(id))
  );
};

const areAllItemsSelected = (items: Array<{ id: string }>, selectedItemsMap: SelectedItemsMap): boolean =>
  areAllIdsSelected(
    items.map((item) => item.id),
    selectedItemsMap,
  );

export function useReportFilters(): ReportFilters {
  const projectsContext = useProjects();

  const { clients } = useClients();
  const contextOrganizationUsers = useReportUsers();
  const { reportedProjects } = projectsContext;

  const [navigationMode, setNavigationMode] = useState<ReportDateRangeNavigationMode>('full-month');
  const [selectedClients, setSelectedClients] = useState<SelectedItemsMap>({});
  const [selectedProjects, setSelectedProjects] = useState<SelectedItemsMap>({});
  const [selectedUsers, setSelectedUsers] = useState<SelectedItemsMap>({});
  const [selectedFromDate, setSelectedFromDate] = useState<Dayjs>(() => dayjs().startOf('month'));
  const [selectedToDate, setSelectedToDate] = useState<Dayjs | null>(() => dayjs().endOf('month').startOf('day'));

  const eligibleUsers = useMemo(
    () =>
      contextOrganizationUsers.filter(
        ({ organizationRoles }) => !organizationRoles.includes(OrganizationUserRole.External),
      ),
    [contextOrganizationUsers],
  );

  const areAllProjectsSelected = areAllItemsSelected(reportedProjects, selectedProjects);
  const areAllUsersSelected = areAllItemsSelected(eligibleUsers, selectedUsers);
  const areAllClientsSelected = areAllItemsSelected(clients, selectedClients);

  const clientsSearchOptions = useMemo(() => createSearchOptions(clients, 'id', 'name'), [clients]);

  const contextOrganizationUserSearchOptions = useMemo(
    () => createSearchOptions(eligibleUsers, 'id', 'fullName'),
    [eligibleUsers],
  );

  const projectsSearchOptions = useMemo(() => createSearchOptions(reportedProjects, 'id', 'name'), [reportedProjects]);

  const setSelectedDateRange = useCallback(
    ({ fromDate, navigationMode: mode, toDate }: ReportDateRangeSnapshot): void => {
      setSelectedFromDate(fromDate.startOf('day'));
      setSelectedToDate(toDate?.startOf('day') ?? null);
      setNavigationMode(mode);
    },
    [],
  );

  const setSelectedFiltersCallback = useCallback(
    ({
      clients: nextClients,
      projects: nextProjects,
      users: nextUsers,
    }: {
      clients: SelectedItemsMap;
      projects: SelectedItemsMap;
      users: SelectedItemsMap;
    }): void => {
      setSelectedClients(nextClients);
      setSelectedProjects(nextProjects);
      setSelectedUsers(nextUsers);
    },
    [],
  );

  return {
    navigationMode,
    selectedClients,
    selectedProjects,
    selectedUsers,
    selectedFromDate,
    selectedToDate,
    clientsSearchOptions,
    contextOrganizationUserSearchOptions,
    projectsSearchOptions,
    areAllProjectsSelected,
    areAllUsersSelected,
    areAllClientsSelected,
    updatedSelectedProjectsKeys: Object.keys(selectedProjects),
    updatedSelectedClientsKeys: Object.keys(selectedClients),
    updatedSelectedUsersKeys: Object.keys(selectedUsers),
    setSelectedDateRange,
    setSelectedProjects,
    setSelectedUsers,
    setSelectedClients,
    setSelectedFilters: setSelectedFiltersCallback,
  };
}
