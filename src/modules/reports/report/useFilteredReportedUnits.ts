import { convertTimeFormat } from '@/core/utils/helpers';
import { SelectedItemsMap } from '@/modules/reports/filterPanel/types';
import { ReportedUnit, UnitState, WorkUnitEntryType } from '@/modules/workingTime/types';
import { useMemo } from 'react';
import dayjs from 'dayjs';

export interface FilteredReportedUnitsResult {
  filteredReportedUnits: ReportedUnit[];
  filteredUnitsDurationSum: string;
  isNotLoadingAndHasNoFilteredUnits: boolean;
}

export interface UseFilteredReportedUnitsArgs {
  reportedUnits: ReportedUnit[];
  selectedClients: SelectedItemsMap;
  selectedProjects: SelectedItemsMap;
  selectedUsers: SelectedItemsMap;
  isLoadingReportData: boolean;
}

export function useFilteredReportedUnits({
  reportedUnits,
  selectedClients,
  selectedProjects,
  selectedUsers,
  isLoadingReportData,
}: UseFilteredReportedUnitsArgs): FilteredReportedUnitsResult {
  const filteredReportedUnits = useMemo(() => {
    const selectedProjectIds = Object.keys(selectedProjects);
    const selectedUserIds = Object.keys(selectedUsers);
    const selectedClientIds = Object.keys(selectedClients);

    const dateSortedUnits = [...reportedUnits].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return dateSortedUnits.filter((unit) => {
      if (unit.state !== UnitState.Active) return false;
      if (unit.entryType !== WorkUnitEntryType.Worklog) return false;

      const projectClient = unit.effectiveProjectClient;
      const projectId = projectClient ? projectClient.projectId : null;
      const clientId = projectClient ? projectClient.clientId : null;

      const isProjectSelected =
        selectedProjectIds.length === 0 || (projectId && selectedProjectIds.includes(projectId));
      const isUserSelected = selectedUserIds.length === 0 || selectedUserIds.includes(unit.userId);
      const isClientSelected = selectedClientIds.length === 0 || (clientId && selectedClientIds.includes(clientId));

      return isProjectSelected && isUserSelected && isClientSelected;
    });
  }, [reportedUnits, selectedClients, selectedProjects, selectedUsers]);

  const filteredUnitsDurationSum = useMemo(() => {
    const total = filteredReportedUnits
      .filter(({ entryType }) => entryType === WorkUnitEntryType.Worklog)
      .reduce((sum, unit) => {
        const duration = dayjs.duration(convertTimeFormat({ time: unit.formattedDuration }));
        const durationDecimal = duration.hours() + duration.minutes() / 60;
        return sum + durationDecimal;
      }, 0);

    const totalMinutes = Math.round(total * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }, [filteredReportedUnits]);

  const isNotLoadingAndHasNoFilteredUnits = useMemo(() => {
    const activeUnits = reportedUnits.filter((unit) => unit.state === UnitState.Active);
    return activeUnits.length === 0 || (!isLoadingReportData && filteredReportedUnits.length === 0);
  }, [filteredReportedUnits.length, isLoadingReportData, reportedUnits]);

  return { filteredReportedUnits, filteredUnitsDurationSum, isNotLoadingAndHasNoFilteredUnits };
}
