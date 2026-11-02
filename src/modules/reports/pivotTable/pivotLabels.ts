import { PIVOT_KEY, type PivotKey } from './constants';
import { coordinateIdentity } from './matrix/buildPivotMatrix';
import { completeMonthAxis } from './matrix/completeMonthAxis';
import type {
  PivotExportMemberLabel,
  PivotFilterValue,
  PivotMonthAxisProjection,
  WorkUnitPivotQueryRequest,
  WorkUnitPivotQueryResponse,
} from './types';

export type PivotLabelResolver = (key: PivotKey, value: PivotFilterValue) => string;
export type PivotTranslate = (key: string, params?: Record<string, unknown>) => string;

interface PivotLabelResolverDependencies {
  clients: ReadonlyArray<{ id: string; name: string }>;
  locale: string;
  projects: ReadonlyArray<{ id: string; name: string }>;
  t: PivotTranslate;
  users: ReadonlyArray<{ fullName: string; id: string }>;
}

const indexLabels = <T extends { id: string }>(
  items: ReadonlyArray<T>,
  label: (item: T) => string,
): Map<string, string> => {
  const labels = new Map<string, string>();
  items.forEach((item) => {
    if (!labels.has(item.id)) labels.set(item.id, label(item));
  });
  return labels;
};

export const createPivotLabelResolver = ({
  clients,
  locale,
  projects,
  t,
  users,
}: PivotLabelResolverDependencies): PivotLabelResolver => {
  const clientLabels = indexLabels(clients, ({ name }) => name);
  const projectLabels = indexLabels(projects, ({ name }) => name);
  const userLabels = indexLabels(users, ({ fullName }) => fullName);
  const monthFormatter = new Intl.DateTimeFormat(locale, {
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  });
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
    year: 'numeric',
  });

  return (key, rawValue) => {
    if (key === PIVOT_KEY.CLIENT && rawValue === null) return t('pivot_table.filter.no_client');
    if (key === PIVOT_KEY.TASK && rawValue === null) return t('pivot_table.filter.no_task');
    const value = String(rawValue);

    switch (key) {
      case PIVOT_KEY.USER:
        return userLabels.get(value) ?? t('pivot_table.table.unknown_value', { value });
      case PIVOT_KEY.PROJECT:
        return projectLabels.get(value) ?? t('pivot_table.table.unknown_value', { value });
      case PIVOT_KEY.CLIENT:
        return clientLabels.get(value) ?? t('pivot_table.table.unknown_value', { value });
      case PIVOT_KEY.MONTH_YEAR: {
        const [year, month] = value.split('-').map(Number);
        return monthFormatter.format(new Date(Date.UTC(year, month - 1, 1)));
      }
      case PIVOT_KEY.DATE: {
        const [year, month, day] = value.split('-').map(Number);
        return dateFormatter.format(new Date(Date.UTC(year, month - 1, day)));
      }
      case PIVOT_KEY.ENTRY_TYPE:
        return t(`pivot_table.entry_type.${value}`);
      case PIVOT_KEY.YEAR:
        return value;
      case PIVOT_KEY.TASK: {
        // task_id is unconstrained free text (no length/format limit anywhere in the system) --
        // sanitize so a pathological value can never fail export label validation. Re-check emptiness
        // after sanitizing (a control-character-only id would otherwise become a blank label), and
        // truncate by code point (not UTF-16 code unit) so a surrogate pair is never split.
        // eslint-disable-next-line no-control-regex -- stripping control characters is the point.
        const sanitized = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
        if (sanitized.trim() === '') return t('pivot_table.filter.no_task');
        const codePoints = Array.from(sanitized);
        return codePoints.length > 140 ? `${codePoints.slice(0, 139).join('')}…` : sanitized;
      }
    }
  };
};

export const buildPivotMemberIdentities = (
  response: WorkUnitPivotQueryResponse,
  request?: WorkUnitPivotQueryRequest,
  projection?: PivotMonthAxisProjection,
): Array<Pick<PivotExportMemberLabel, 'key' | 'value'>> => {
  const identities: Array<Pick<PivotExportMemberLabel, 'key' | 'value'>> = [];
  const seen = new Set<string>();

  response.cells.forEach(({ column, row }) => {
    [row, column].forEach(({ path }) => {
      path.forEach(({ key, value }) => {
        const identity = JSON.stringify([key, value]);
        if (seen.has(identity)) return;
        seen.add(identity);
        identities.push({ key, value });
      });
    });
  });

  if (request?.columns.length === 1 && request.columns[0] === PIVOT_KEY.MONTH_YEAR && projection) {
    const columnCoordinates = Array.from(
      new Map(response.cells.map(({ column }) => [coordinateIdentity(column), column])).values(),
    );
    const completedMonths = completeMonthAxis({
      columns: request.columns,
      columnCoordinates,
      projection,
      rowCount: 1,
      valuesCount: 1,
      displayValueCellCount: response.result.displayValueCellCount,
      maxDisplayValueCellCount: Number.MAX_SAFE_INTEGER,
    }).columnCoordinates.flatMap(({ kind, path }) =>
      kind === 'Leaf' && path.length === 1 && path[0]?.key === PIVOT_KEY.MONTH_YEAR
        ? [{ key: PIVOT_KEY.MONTH_YEAR, value: path[0].value }]
        : [],
    );
    const completedMonthValues = new Set(completedMonths.map(({ value }) => value));
    const originalMonths = identities.filter(
      ({ key, value }) => key === PIVOT_KEY.MONTH_YEAR && !completedMonthValues.has(value),
    );
    const firstMonthIndex = identities.findIndex(({ key }) => key === PIVOT_KEY.MONTH_YEAR);
    const insertionIndex = firstMonthIndex < 0 ? identities.length : firstMonthIndex;

    return [
      ...identities.slice(0, insertionIndex).filter(({ key }) => key !== PIVOT_KEY.MONTH_YEAR),
      ...completedMonths,
      ...originalMonths,
      ...identities.slice(insertionIndex).filter(({ key }) => key !== PIVOT_KEY.MONTH_YEAR),
    ];
  }

  return identities;
};
