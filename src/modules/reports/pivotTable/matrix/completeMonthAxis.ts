import { PIVOT_KEY, type PivotKey } from '../constants';
import type { PivotCoordinate, PivotMonthAxisProjection } from '../types';

const DATE_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MAX_SAFE_ARITHMETIC_VALUE = Number.MAX_SAFE_INTEGER;

interface CompleteMonthAxisArgs {
  columns: readonly PivotKey[];
  columnCoordinates: PivotCoordinate[];
  projection?: PivotMonthAxisProjection;
  rowCount: number;
  valuesCount: number;
  displayValueCellCount: number;
  maxDisplayValueCellCount: number;
}

interface CompleteMonthAxisResult {
  columnCoordinates: PivotCoordinate[];
  displayValueCellCount: number;
}

interface CalendarDateParts {
  year: number;
  month: number;
}

interface SafeProduct {
  value: number;
  overflowed: boolean;
}

export class PivotResultTooLargeError extends Error {
  readonly displayValueCellCount: number;
  readonly maxDisplayValueCellCount: number;

  constructor(displayValueCellCount: number, maxDisplayValueCellCount: number) {
    super('Pivot result exceeds maxDisplayValueCellCount');
    this.name = 'PivotResultTooLargeError';
    this.displayValueCellCount = displayValueCellCount;
    this.maxDisplayValueCellCount = maxDisplayValueCellCount;
  }
}

const isLeapYear = (year: number): boolean => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const daysInMonth = (year: number, month: number): number => {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

const parseCalendarDate = (value: string, field: keyof PivotMonthAxisProjection): CalendarDateParts => {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new Error(`Invalid Month axis projection ${field}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year === 0 || day > daysInMonth(year, month)) {
    throw new Error(`Invalid Month axis projection ${field}`);
  }

  return { year, month };
};

const saturatedProduct = (factors: readonly number[]): SafeProduct => {
  if (factors.some((factor) => factor === 0)) return { value: 0, overflowed: false };

  let value = 1;
  for (const factor of factors) {
    if (value > Math.floor(MAX_SAFE_ARITHMETIC_VALUE / factor)) {
      return { value: MAX_SAFE_ARITHMETIC_VALUE, overflowed: true };
    }
    value *= factor;
  }
  return { value, overflowed: false };
};

const monthIdentity = (year: number, month: number): string =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;

export const completeMonthAxis = ({
  columns,
  columnCoordinates,
  projection,
  rowCount,
  valuesCount,
  displayValueCellCount,
  maxDisplayValueCellCount,
}: CompleteMonthAxisArgs): CompleteMonthAxisResult => {
  const isMonthOnly = columns.length === 1 && columns[0] === PIVOT_KEY.MONTH_YEAR;
  if (!projection || !isMonthOnly) return { columnCoordinates, displayValueCellCount };

  const start = parseCalendarDate(projection.dateFrom, 'dateFrom');
  const end = parseCalendarDate(projection.effectiveDateTo, 'effectiveDateTo');
  if (projection.effectiveDateTo < projection.dateFrom) {
    throw new Error('Month axis projection effectiveDateTo must not be before dateFrom');
  }

  const startMonthIndex = start.year * 12 + start.month - 1;
  const endMonthIndex = end.year * 12 + end.month - 1;
  const monthCount = endMonthIndex - startMonthIndex + 1;
  const grandTotal = columnCoordinates.find(({ kind }) => kind === 'GrandTotal');
  const completedColumnCount = monthCount + (grandTotal ? 1 : 0);
  const expandedCount = saturatedProduct([rowCount, completedColumnCount, valuesCount]);

  if (expandedCount.overflowed || expandedCount.value > maxDisplayValueCellCount) {
    throw new PivotResultTooLargeError(expandedCount.value, maxDisplayValueCellCount);
  }

  const existingMonths = new Map<string, PivotCoordinate>();
  columnCoordinates.forEach((coordinate) => {
    const segment = coordinate.path[0];
    if (coordinate.kind === 'Leaf' && coordinate.path.length === 1 && segment?.key === PIVOT_KEY.MONTH_YEAR) {
      existingMonths.set(String(segment.value), coordinate);
    }
  });

  const completedCoordinates: PivotCoordinate[] = [];
  for (let monthIndex = startMonthIndex; monthIndex <= endMonthIndex; monthIndex += 1) {
    const year = Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    const identity = monthIdentity(year, month);
    completedCoordinates.push(
      existingMonths.get(identity) ?? {
        kind: 'Leaf',
        path: [{ key: PIVOT_KEY.MONTH_YEAR, value: identity }],
      },
    );
  }
  if (grandTotal) completedCoordinates.push(grandTotal);

  return { columnCoordinates: completedCoordinates, displayValueCellCount: expandedCount.value };
};
