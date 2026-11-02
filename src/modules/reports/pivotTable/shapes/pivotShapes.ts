import { PIVOT_KEY, PIVOT_VALUE, type PivotKey } from '../constants';
import type { PivotShape } from '../layout/pivotShapeURL';

const rowsOnly = (...rows: PivotKey[]): PivotShape => ({ rows, columns: [], values: [PIVOT_VALUE.DURATION_SUM] });
const byMonth = (...rows: PivotKey[]): PivotShape => ({
  rows,
  columns: [PIVOT_KEY.MONTH_YEAR],
  values: [PIVOT_VALUE.DURATION_SUM],
});

const { CLIENT, MONTH_YEAR, PROJECT, USER } = PIVOT_KEY;

/** Table shapes offered next to the tab: row levels only, then a few with months as columns. Each one is just a URL. */
export const PIVOT_SHAPES: readonly PivotShape[] = [
  rowsOnly(MONTH_YEAR, USER),
  rowsOnly(MONTH_YEAR, CLIENT, PROJECT),
  rowsOnly(MONTH_YEAR, USER, PROJECT),
  rowsOnly(CLIENT, PROJECT, USER),
  rowsOnly(CLIENT, PROJECT, MONTH_YEAR),
  rowsOnly(PROJECT, USER),
  rowsOnly(PROJECT, USER, MONTH_YEAR),
  rowsOnly(USER, PROJECT),
  rowsOnly(USER, PROJECT, MONTH_YEAR),
  rowsOnly(USER, CLIENT, PROJECT),
  byMonth(USER),
  byMonth(CLIENT, PROJECT),
  byMonth(CLIENT, PROJECT, USER),
  byMonth(PROJECT, USER),
  byMonth(USER, PROJECT),
];
