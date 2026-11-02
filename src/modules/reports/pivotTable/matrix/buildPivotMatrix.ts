import { PIVOT_KEY, type PivotKey, type PivotValue } from '../constants';
import type {
  PivotCell,
  PivotCoordinate,
  PivotFilterValue,
  PivotMonthAxisProjection,
  WorkUnitPivotQueryRequest,
  WorkUnitPivotQueryResponse,
} from '../types';
import { completeMonthAxis } from './completeMonthAxis';

export interface PivotMatrixModel {
  rowCoordinates: PivotCoordinate[];
  columnCoordinates: PivotCoordinate[];
  values: PivotValue[];
  cellsByCoordinate: ReadonlyMap<string, PivotCell>;
  signature: string;
  getCell: (row: PivotCoordinate, column: PivotCoordinate) => PivotCell | undefined;
}

export const coordinateIdentity = (coordinate: PivotCoordinate): string =>
  JSON.stringify([coordinate.kind, coordinate.path.map(({ key, value }) => [key, value])]);

export const pivotCellIdentity = (row: PivotCoordinate, column: PivotCoordinate): string =>
  JSON.stringify([coordinateIdentity(row), coordinateIdentity(column)]);

const addCoordinate = (coordinates: PivotCoordinate[], identities: Set<string>, coordinate: PivotCoordinate): void => {
  const identity = coordinateIdentity(coordinate);
  if (identities.has(identity)) return;
  identities.add(identity);
  coordinates.push(coordinate);
};

const compareStrings = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const compareFieldValues = (key: PivotKey, left: PivotFilterValue, right: PivotFilterValue): number => {
  if (key === PIVOT_KEY.CLIENT) {
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
  }
  if (key === PIVOT_KEY.TASK) {
    // null and any whitespace-only string both render as the same "no task" label
    // (pivotLabels.ts) -- sort them together at the end instead of letting "   " fall
    // among ordinary strings, far from its visual twin.
    const leftIsNoTask = left === null || (typeof left === 'string' && left.trim() === '');
    const rightIsNoTask = right === null || (typeof right === 'string' && right.trim() === '');
    if (leftIsNoTask) return rightIsNoTask ? 0 : 1;
    if (rightIsNoTask) return -1;
  }
  if (key === PIVOT_KEY.YEAR && typeof left === 'number' && typeof right === 'number') return left - right;
  if (key === PIVOT_KEY.ENTRY_TYPE && typeof left === 'string' && typeof right === 'string') {
    const order = { Worklog: 0, Note: 1 } as const;
    if (left in order && right in order) return order[left as keyof typeof order] - order[right as keyof typeof order];
  }
  if (typeof left === 'string' && typeof right === 'string')
    return compareStrings(left.toLowerCase(), right.toLowerCase());
  throw new Error(`Invalid pivot coordinate value for ${key}`);
};

const compareCoordinates = (
  axis: PivotKey[],
  left: PivotCoordinate,
  right: PivotCoordinate,
  hierarchyOrder: 'parent-first' | 'descendant-first',
): number => {
  if (left.kind === 'GrandTotal') return right.kind === 'GrandTotal' ? 0 : 1;
  if (right.kind === 'GrandTotal') return -1;

  const commonLength = Math.min(left.path.length, right.path.length);
  for (let index = 0; index < commonLength; index += 1) {
    const expectedKey = axis[index];
    const leftSegment = left.path[index];
    const rightSegment = right.path[index];
    if (!expectedKey || leftSegment.key !== expectedKey || rightSegment.key !== expectedKey) {
      throw new Error(`Invalid pivot coordinate path at index ${index}`);
    }
    const compared = compareFieldValues(expectedKey, leftSegment.value, rightSegment.value);
    if (compared !== 0) return compared;
  }
  if (left.path.length !== right.path.length) {
    return hierarchyOrder === 'parent-first'
      ? left.path.length - right.path.length
      : right.path.length - left.path.length;
  }
  return compareStrings(left.kind, right.kind);
};

export const buildPivotMatrix = (
  response: WorkUnitPivotQueryResponse,
  request: WorkUnitPivotQueryRequest,
  projection?: PivotMonthAxisProjection,
): PivotMatrixModel => {
  const rowCoordinates: PivotCoordinate[] = [];
  let columnCoordinates: PivotCoordinate[] = [];
  const rowIdentities = new Set<string>();
  const columnIdentities = new Set<string>();
  const cellsByCoordinate = new Map<string, PivotCell>();

  response.cells.forEach((cell) => {
    addCoordinate(rowCoordinates, rowIdentities, cell.row);
    addCoordinate(columnCoordinates, columnIdentities, cell.column);
    cellsByCoordinate.set(pivotCellIdentity(cell.row, cell.column), cell);
  });

  rowCoordinates.sort((left, right) => compareCoordinates(request.rows, left, right, 'parent-first'));
  columnCoordinates.sort((left, right) => compareCoordinates(request.columns, left, right, 'descendant-first'));

  const values = [...request.values];
  columnCoordinates = completeMonthAxis({
    columns: request.columns,
    columnCoordinates,
    projection,
    rowCount: rowCoordinates.length,
    valuesCount: values.length,
    displayValueCellCount: response.result.displayValueCellCount,
    maxDisplayValueCellCount: response.result.maxDisplayValueCellCount,
  }).columnCoordinates;
  const signature = JSON.stringify({
    rows: request.rows,
    columns: request.columns,
    values,
    rowCoordinates: rowCoordinates.map(coordinateIdentity),
    columnCoordinates: columnCoordinates.map(coordinateIdentity),
  });

  return {
    rowCoordinates,
    columnCoordinates,
    values,
    cellsByCoordinate,
    signature,
    getCell: (row, column) => cellsByCoordinate.get(pivotCellIdentity(row, column)),
  };
};
