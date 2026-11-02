import { PIVOT_KEY } from '../constants';
import type { PivotCoordinate } from '../types';
import { completeMonthAxis, PivotResultTooLargeError } from './completeMonthAxis';

const projection = { dateFrom: '2026-02-01', effectiveDateTo: '2026-08-20' };

const month = (value: string): PivotCoordinate => ({
  kind: 'Leaf',
  path: [{ key: PIVOT_KEY.MONTH_YEAR, value }],
});

const grandTotal: PivotCoordinate = { kind: 'GrandTotal', path: [] };

const sparseMonths = [month('2026-05'), month('2026-06'), month('2026-07'), month('2026-08'), grandTotal];

const complete = (
  overrides: Partial<Parameters<typeof completeMonthAxis>[0]> = {},
): ReturnType<typeof completeMonthAxis> =>
  completeMonthAxis({
    columns: [PIVOT_KEY.MONTH_YEAR],
    columnCoordinates: sparseMonths,
    projection,
    rowCount: 4,
    valuesCount: 3,
    displayValueCellCount: 60,
    maxDisplayValueCellCount: 9_600,
    ...overrides,
  });

describe('completeMonthAxis', () => {
  it('completes every inclusive Month leaf and keeps the existing Grand Total last', () => {
    const result = complete();

    expect(result.columnCoordinates.map(({ path }) => path[0]?.value ?? 'GrandTotal')).toEqual([
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      'GrandTotal',
    ]);
    expect(result.displayValueCellCount).toBe(4 * 8 * 3);
    expect(result.columnCoordinates.slice(3, 7)).toEqual(sparseMonths.slice(0, 4));
    expect(result.columnCoordinates[7]).toBe(grandTotal);
  });

  it.each([
    ['empty columns', []],
    ['Year-only columns', [PIVOT_KEY.YEAR]],
    ['Year to Month columns', [PIVOT_KEY.YEAR, PIVOT_KEY.MONTH_YEAR]],
  ] as const)('leaves sparse coordinates and the backend count untouched for %s', (_name, columns) => {
    const result = complete({ columns });

    expect(result.columnCoordinates).toBe(sparseMonths);
    expect(result.displayValueCellCount).toBe(60);
  });

  it('leaves the sparse Month axis untouched when no accepted projection is supplied', () => {
    const result = complete({ projection: undefined });

    expect(result.columnCoordinates).toBe(sparseMonths);
    expect(result.displayValueCellCount).toBe(60);
  });

  it('includes both endpoints across a year boundary', () => {
    const result = complete({
      columnCoordinates: [month('2026-12')],
      projection: { dateFrom: '2026-11-30', effectiveDateTo: '2027-02-01' },
      rowCount: 1,
      valuesCount: 1,
    });

    expect(result.columnCoordinates.map(({ path }) => path[0]?.value)).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });

  it('normalizes an inclusive closed range within one month to one Month leaf', () => {
    const result = complete({
      columnCoordinates: [],
      projection: { dateFrom: '2026-02-28', effectiveDateTo: '2026-02-28' },
      rowCount: 1,
      valuesCount: 1,
    });

    expect(result.columnCoordinates).toEqual([month('2026-02')]);
    expect(result.displayValueCellCount).toBe(1);
  });

  it('uses the captured effective end for an open range', () => {
    const result = complete({
      columnCoordinates: [month('2026-05')],
      projection: { dateFrom: '2026-05-01', effectiveDateTo: '2026-07-01' },
      rowCount: 1,
      valuesCount: 1,
    });

    expect(result.columnCoordinates.map(({ path }) => path[0]?.value)).toEqual(['2026-05', '2026-06', '2026-07']);
  });

  it('rejects an effective end before the start', () => {
    expect(() => complete({ projection: { dateFrom: '2026-08-01', effectiveDateTo: '2026-07-31' } })).toThrow(
      'effectiveDateTo must not be before dateFrom',
    );
  });

  it('saturates the expanded count safely and signals result-too-large', () => {
    let thrown: unknown;

    try {
      complete({
        columnCoordinates: [],
        projection: { dateFrom: '2026-01-01', effectiveDateTo: '2026-01-31' },
        rowCount: Number.MAX_SAFE_INTEGER,
        valuesCount: 2,
        maxDisplayValueCellCount: Number.MAX_SAFE_INTEGER,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PivotResultTooLargeError);
    expect((thrown as PivotResultTooLargeError).displayValueCellCount).toBe(Number.MAX_SAFE_INTEGER);
    expect((thrown as PivotResultTooLargeError).maxDisplayValueCellCount).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('signals result-too-large from the arithmetic month count before materializing a large Month vector', () => {
    expect(() =>
      complete({
        columnCoordinates: [],
        projection: { dateFrom: '0001-01-01', effectiveDateTo: '9999-12-31' },
        rowCount: 1,
        valuesCount: 1,
        maxDisplayValueCellCount: 1,
      }),
    ).toThrow(PivotResultTooLargeError);
  });
});
