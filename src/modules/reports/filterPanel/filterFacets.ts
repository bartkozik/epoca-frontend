import { PIVOT_KEY } from '@/modules/reports/pivotTable/constants';
import type { PivotCell, WorkUnitPivotQueryRequest } from '@/modules/reports/pivotTable/types';

/** Hours per client × project × user for the report period; the base for every filter's option hours. */
export const FILTER_FACETS_REQUEST: WorkUnitPivotQueryRequest = {
  rows: [PIVOT_KEY.CLIENT, PIVOT_KEY.PROJECT, PIVOT_KEY.USER],
  columns: [],
  values: ['DurationSum'],
  filters: [],
  options: { rowSubtotals: false, columnSubtotals: false, grandTotals: false },
};

export interface FacetCell {
  clientId: string | null;
  projectId: string | null;
  userId: string | null;
  seconds: number;
}

export interface FacetSelection {
  clientIds: readonly string[];
  projectIds: readonly string[];
  userIds: readonly string[];
}

export interface FilterFacets {
  clients: Map<string, number>;
  projects: Map<string, number>;
  users: Map<string, number>;
}

const segmentValue = (cell: PivotCell, key: string): string | null => {
  const value = cell.row.path.find((segment) => segment.key === key)?.value;
  return typeof value === 'string' ? value : null;
};

export const toFacetCells = (cells: readonly PivotCell[]): FacetCell[] =>
  cells
    .filter((cell) => cell.row.kind === 'Leaf')
    .map((cell) => ({
      clientId: segmentValue(cell, PIVOT_KEY.CLIENT),
      projectId: segmentValue(cell, PIVOT_KEY.PROJECT),
      userId: segmentValue(cell, PIVOT_KEY.USER),
      seconds: (cell.values.durationSum?.seconds ?? 0) + (cell.values.durationSum?.nanoseconds ?? 0) / 1e9,
    }));

const allows = (selected: readonly string[], id: string | null): boolean =>
  selected.length === 0 || (id !== null && selected.includes(id));

const add = (totals: Map<string, number>, id: string | null, seconds: number): void => {
  if (id !== null) totals.set(id, (totals.get(id) ?? 0) + seconds);
};

/**
 * Hours each option would contribute given the OTHER two filters, ignoring the option's own filter.
 * So picking a user never hides other users, and the result does not depend on the order of picks.
 */
export const computeFilterFacets = (cells: readonly FacetCell[], selection: FacetSelection): FilterFacets => {
  const facets: FilterFacets = { clients: new Map(), projects: new Map(), users: new Map() };
  cells.forEach(({ clientId, projectId, userId, seconds }) => {
    const clientOk = allows(selection.clientIds, clientId);
    const projectOk = allows(selection.projectIds, projectId);
    const userOk = allows(selection.userIds, userId);
    if (projectOk && userOk) add(facets.clients, clientId, seconds);
    if (clientOk && userOk) add(facets.projects, projectId, seconds);
    if (clientOk && projectOk) add(facets.users, userId, seconds);
  });
  return facets;
};

/** Report-style hours, e.g. 05:00 or 193:15. */
export const formatFacetHours = (seconds: number): string => {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};
