import colorVariables from '@/core/theme/variables.module.scss';
import { convertIsoDurationToHours, DATE_FORMAT, getHoursFromDuration } from '@/core/utils/helpers';
import dayjs from 'dayjs';
import i18n from 'i18next';
import { ProjectClientReportedData, Unit, UnitsDto, UnitState, WorkUnitEntryType } from './types';

const MIN_DAILY_REPORTED_HOURS = 8;
const MAX_DAILY_REPORTED_HOURS = 672;

export function calculateUnitsWeeklyTotalHours(units: Unit[]): number {
  return units
    .filter((unit) => unit.entryType === WorkUnitEntryType.Worklog)
    .reduce((sum, unit) => sum + convertIsoDurationToHours(unit.duration), 0);
}

export function calculateUnitsWeeklyReportedHours(units: Unit[]): number {
  return units
    .filter((unit) => unit.state !== UnitState.Draft && unit.entryType === WorkUnitEntryType.Worklog)
    .reduce((sum, unit) => sum + convertIsoDurationToHours(unit.duration), 0);
}

export function calculateClientHoursForWeek(units: Unit[]): Record<string, ProjectClientReportedData> {
  const unitsSortedByClientName = [...units].sort((a, b) => {
    const clientA = a.projectClient ? a.projectClient.clientName.toLowerCase() : '';
    const clientB = b.projectClient ? b.projectClient.clientName.toLowerCase() : '';
    return clientA.localeCompare(clientB);
  });

  return unitsSortedByClientName
    .filter((unit) => unit.state !== UnitState.Draft && unit.entryType === WorkUnitEntryType.Worklog)
    .reduce<Record<string, ProjectClientReportedData>>((acc, unit) => {
      const clientName = unit.projectClient?.clientName || i18n.t('common.unknown');
      const hours = getHoursFromDuration(unit.formattedDuration);
      if (acc[clientName]) {
        acc[clientName].hours += hours;
      } else {
        acc[clientName] = {
          hours,
          color: unit.projectClient?.clientColor || colorVariables.colorClientDefault,
        };
      }
      return acc;
    }, {});
}

export function getUnitsForDay(units: Unit[], date: Date): Unit[] {
  return units.filter(
    (unit) =>
      dayjs(unit.date).format(DATE_FORMAT.DAY_BE_FORMAT) === dayjs(date).format(DATE_FORMAT.DAY_BE_FORMAT) &&
      unit.state === UnitState.Active,
  );
}

function calculateTotalHours(units: Unit[], editingUnitId?: string): number {
  return units.reduce((acc, curr) => {
    if (curr.entryType !== WorkUnitEntryType.Worklog || (editingUnitId && curr.id === editingUnitId)) return acc;

    const [hours, minutes] = curr.formattedDuration.split(':').map(Number);
    const totalHours = hours + minutes / 60;
    return acc + totalHours;
  }, 0);
}

export function getAvailableHoursForDay(units: Unit[], date: Date, editingUnitId?: string): number {
  const unitsForDay = getUnitsForDay(units, date);
  const totalReportedHoursForDay = calculateTotalHours(unitsForDay, editingUnitId);
  return parseFloat((MAX_DAILY_REPORTED_HOURS - totalReportedHoursForDay).toFixed(2));
}

export function isReportedMinimumHoursForDay(units: Unit[], date: Date): boolean {
  const unitsForDay = getUnitsForDay(units, date);
  const totalReportedHoursForDay = calculateTotalHours(unitsForDay);
  return totalReportedHoursForDay >= MIN_DAILY_REPORTED_HOURS;
}

export function buildMainUnitsDto(weekStart: string, weekEnd: string, userId: string[]): UnitsDto {
  return { includeArchived: false, dateFrom: weekStart, dateTo: weekEnd, userId };
}
