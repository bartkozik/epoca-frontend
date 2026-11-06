import type { WorldRuntime } from '../../worlds/runtime';
import type { MockHandler, MockResponse } from './types';

export const REPORT_FILTER_FACETS_REQUEST = {
  rows: ['ClientKey', 'ProjectKey', 'UserKey'],
  columns: [],
  values: ['DurationSum'],
  filters: [],
  options: { rowSubtotals: false, columnSubtotals: false, grandTotals: false },
} as const;

const MAX_DISPLAY_VALUE_CELL_COUNT = 9_600;
const MANAGEMENT_ROLES = new Set(['Owner', 'Manager']);
const PERIOD_QUERY_KEYS = ['dateFrom', 'dateTo'];
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DURATION_PATTERN = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)(?:\.(\d{1,9}))?S)?)?$/;
const NANOS_PER_SECOND = 1_000_000_000;

const isCalendarDate = (value: string): boolean => {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const durationNanos = (duration: string): number => {
  const match = DURATION_PATTERN.exec(duration);
  if (!match || duration === 'P' || duration.endsWith('T')) throw new Error(`Invalid world duration: ${duration}`);
  const [, days = '0', hours = '0', minutes = '0', seconds = '0', fraction = ''] = match;
  const wholeSeconds = Number(days) * 86_400 + Number(hours) * 3_600 + Number(minutes) * 60 + Number(seconds);
  return wholeSeconds * NANOS_PER_SECOND + Number(fraction.padEnd(9, '0') || 0);
};

const formatDuration = (nanos: number): string => {
  if (nanos === 0) return 'PT0S';
  const totalSeconds = Math.floor(nanos / NANOS_PER_SECOND);
  const fraction = nanos % NANOS_PER_SECOND;
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const fractionText = fraction > 0 ? `.${String(fraction).padStart(9, '0').replace(/0+$/, '')}` : '';
  return [
    'PT',
    hours > 0 ? `${hours}H` : '',
    minutes > 0 ? `${minutes}M` : '',
    seconds > 0 || fraction > 0 ? `${seconds}${fractionText}S` : '',
  ].join('');
};

const parsePeriod = (
  query: Readonly<Record<string, readonly string[]>>,
): { dateFrom: string; dateTo: string } | null => {
  const keys = Object.keys(query).sort();
  if (keys.length !== PERIOD_QUERY_KEYS.length || keys.some((key, index) => key !== PERIOD_QUERY_KEYS[index])) {
    return null;
  }
  const [dateFrom, dateTo] = [query.dateFrom, query.dateTo];
  if (dateFrom.length !== 1 || dateTo.length !== 1) return null;
  if (!isCalendarDate(dateFrom[0]) || !isCalendarDate(dateTo[0]) || dateFrom[0] > dateTo[0]) return null;
  return { dateFrom: dateFrom[0], dateTo: dateTo[0] };
};

const canReadPivotTables = (runtime: WorldRuntime): boolean => {
  const actor = runtime.actor === 'anonymous' ? undefined : runtime.state.actors[runtime.actor];
  return actor?.organizationRoles.some((role) => MANAGEMENT_ROLES.has(role)) ?? false;
};

interface FacetGroup {
  clientId: string;
  projectId: string;
  userId: string;
  nanos: number;
}

export const pivotQueryHandlers: MockHandler[] = [
  {
    id: 'pivot-query-report-filter-facets',
    method: 'POST',
    path: /^\/organizations\/epoca-e2e\/pivot-tables\/work-units\/query$/,
    body: REPORT_FILTER_FACETS_REQUEST,
    handle: (request, runtime): MockResponse => {
      if (!canReadPivotTables(runtime)) {
        return { status: 403, json: { message: "User's role doesn't allow to access pivot table" } };
      }
      const period = parsePeriod(request.query);
      if (!period) return { status: 400, json: { message: 'Report filter facets need exactly one valid period' } };

      const groups = new Map<string, FacetGroup>();
      for (const workUnit of runtime.state.workUnits) {
        if (workUnit.state !== 'Active' || workUnit.date < period.dateFrom || workUnit.date > period.dateTo) continue;
        const project = runtime.state.projects.find(({ id }) => id === workUnit.projectId);
        if (!project) throw new Error(`Work unit ${workUnit.id} has no project ${workUnit.projectId}`);
        const key = [project.clientId, project.id, workUnit.userId].join('\0');
        const group = groups.get(key) ?? {
          clientId: project.clientId,
          projectId: project.id,
          userId: workUnit.userId,
          nanos: 0,
        };
        group.nanos += workUnit.entryType === 'Worklog' ? durationNanos(workUnit.duration) : 0;
        groups.set(key, group);
      }

      const cells = [...groups.entries()]
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([, { clientId, projectId, userId, nanos }]) => ({
          row: {
            kind: 'Leaf',
            path: [
              { key: 'ClientKey', value: clientId },
              { key: 'ProjectKey', value: projectId },
              { key: 'UserKey', value: userId },
            ],
          },
          column: { kind: 'Leaf', path: [] },
          values: { durationSum: formatDuration(nanos) },
        }));
      return {
        status: 200,
        json: {
          cells,
          filterMembers: [],
          result: {
            cellCount: cells.length,
            displayValueCellCount: cells.length,
            maxDisplayValueCellCount: MAX_DISPLAY_VALUE_CELL_COUNT,
          },
        },
      };
    },
  },
];
