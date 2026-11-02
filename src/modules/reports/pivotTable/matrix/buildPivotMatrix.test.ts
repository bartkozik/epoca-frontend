import canonicalResponse from '@/modules/reports/models/__fixtures__/work-unit-pivot-query-canonical-response.json';
import { parsePivotResponse } from '@/modules/reports/models/pivotTableQuery.model';
import { PIVOT_KEY, PIVOT_VALUE } from '../constants';
import type { PivotCell, PivotCoordinate, WorkUnitPivotQueryRequest, WorkUnitPivotQueryResponse } from '../types';
import { buildPivotMatrix, coordinateIdentity, pivotCellIdentity } from './buildPivotMatrix';

export const canonicalRequest: WorkUnitPivotQueryRequest = {
  rows: [PIVOT_KEY.USER, PIVOT_KEY.PROJECT],
  columns: [PIVOT_KEY.MONTH_YEAR],
  values: [PIVOT_VALUE.DURATION_SUM, PIVOT_VALUE.DURATION_AVG, PIVOT_VALUE.ENTRIES_COUNT],
  filters: [],
  options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
};

export const canonicalParsedResponse = (): WorkUnitPivotQueryResponse =>
  parsePivotResponse(canonicalResponse, canonicalRequest);

describe('buildPivotMatrix', () => {
  it('indexes the exact canonical sparse cells without allocating a Cartesian cell set', () => {
    const response = canonicalParsedResponse();
    const model = buildPivotMatrix(response, canonicalRequest);

    expect(model.rowCoordinates).toHaveLength(4);
    expect(model.columnCoordinates).toHaveLength(3);
    expect(model.values).toEqual(canonicalRequest.values);
    expect(model.cellsByCoordinate.size).toBe(11);
    expect(model.rowCoordinates.map(({ kind }) => kind)).toEqual(['Subtotal', 'Leaf', 'Leaf', 'GrandTotal']);
    expect(model.columnCoordinates.map(({ kind }) => kind)).toEqual(['Leaf', 'Leaf', 'GrandTotal']);
    const projectA = model.rowCoordinates.find(({ path }) => path[1]?.value === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(projectA).toBeDefined();
    expect(model.getCell(projectA as PivotCoordinate, model.columnCoordinates[0])).toBe(response.cells[0]);

    const projectB = model.rowCoordinates.find(({ path }) => path[1]?.value === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    const august = model.columnCoordinates.find(({ path }) => path[0]?.value === '2026-08');
    expect(projectB).toBeDefined();
    expect(august).toBeDefined();
    expect(model.getCell(projectB as PivotCoordinate, august as PivotCoordinate)).toBeUndefined();
  });

  it('completes only the Month column axis while retaining the exact sparse cell index', () => {
    const row = canonicalParsedResponse().cells[0].row;
    const populatedCells: PivotCell[] = ['2026-05', '2026-06', '2026-07', '2026-08'].map((value) => ({
      row,
      column: {
        kind: 'Leaf',
        path: [{ key: PIVOT_KEY.MONTH_YEAR, value }],
      },
      values: {
        durationSum: { seconds: 60, nanoseconds: 0 },
        durationAvg: { seconds: 60, nanoseconds: 0 },
        entriesCount: 1,
      },
    }));
    const grandTotalCell: PivotCell = {
      ...populatedCells[0],
      column: { kind: 'GrandTotal', path: [] },
    };
    const response: WorkUnitPivotQueryResponse = {
      cells: [...populatedCells, grandTotalCell],
      filterMembers: [],
      result: { cellCount: 5, displayValueCellCount: 15, maxDisplayValueCellCount: 9_600 },
    };
    const model = buildPivotMatrix(response, canonicalRequest, {
      dateFrom: '2026-02-01',
      effectiveDateTo: '2026-08-20',
    });

    expect(model.columnCoordinates.map(({ path }) => path[0]?.value ?? 'GrandTotal')).toEqual([
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      'GrandTotal',
    ]);
    expect(model.cellsByCoordinate.size).toBe(response.cells.length);
    response.cells.forEach((cell) => expect(model.getCell(cell.row, cell.column)).toBe(cell));

    const february = model.columnCoordinates[0];
    expect(model.getCell(row, february)).toBeUndefined();
  });

  it('uses stable collision-free coordinate and pair identities', () => {
    const left: PivotCoordinate = {
      kind: 'Leaf',
      path: [{ key: PIVOT_KEY.ENTRY_TYPE, value: 'a|b' }],
    };
    const right: PivotCoordinate = {
      kind: 'Leaf',
      path: [{ key: PIVOT_KEY.ENTRY_TYPE, value: 'a' }],
    };
    const other: PivotCoordinate = {
      kind: 'Leaf',
      path: [{ key: PIVOT_KEY.ENTRY_TYPE, value: 'b' }],
    };

    expect(coordinateIdentity(left)).toBe(coordinateIdentity({ ...left, path: [...left.path] }));
    expect(pivotCellIdentity(left, right)).not.toBe(pivotCellIdentity(right, other));
  });

  it('preserves structural empty axes as one coordinate each', () => {
    const coordinate: PivotCoordinate = { kind: 'Leaf', path: [] };
    const request: WorkUnitPivotQueryRequest = {
      rows: [],
      columns: [],
      values: [PIVOT_VALUE.DURATION_AVG],
      filters: [],
      options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
    };
    const response: WorkUnitPivotQueryResponse = {
      cells: [{ row: coordinate, column: coordinate, values: { durationAvg: null } }],
      filterMembers: [],
      result: { cellCount: 1, displayValueCellCount: 1, maxDisplayValueCellCount: 9_600 },
    };
    const model = buildPivotMatrix(response, request);

    expect(model.rowCoordinates).toEqual([coordinate]);
    expect(model.columnCoordinates).toEqual([coordinate]);
    expect(model.getCell(coordinate, coordinate)?.values.durationAvg).toBeNull();
  });

  it('orders sparse coordinates by their typed axes with row groups before descendants and grand totals last', () => {
    const userA = '11111111-1111-4111-8111-111111111111';
    const userB = '22222222-2222-4222-8222-222222222222';
    const row = (user: string): PivotCoordinate => ({
      kind: 'Leaf',
      path: [{ key: PIVOT_KEY.USER, value: user }],
    });
    const month = (value: string): PivotCoordinate => ({
      kind: 'Leaf',
      path: [{ key: PIVOT_KEY.MONTH_YEAR, value }],
    });
    const grandTotal: PivotCoordinate = { kind: 'GrandTotal', path: [] };
    const request: WorkUnitPivotQueryRequest = {
      rows: [PIVOT_KEY.USER],
      columns: [PIVOT_KEY.MONTH_YEAR],
      values: [PIVOT_VALUE.DURATION_SUM],
      filters: [],
      options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
    };
    const cell = (rowCoordinate: PivotCoordinate, columnCoordinate: PivotCoordinate): PivotCell => ({
      row: rowCoordinate,
      column: columnCoordinate,
      values: { durationSum: { seconds: 60, nanoseconds: 0 } },
    });
    const response: WorkUnitPivotQueryResponse = {
      cells: [
        cell(row(userB), month('2026-06')),
        cell(row(userB), grandTotal),
        cell(row(userA), month('2026-08')),
        cell(row(userA), month('2026-07')),
      ],
      filterMembers: [],
      result: { cellCount: 4, displayValueCellCount: 4, maxDisplayValueCellCount: 9_600 },
    };

    const model = buildPivotMatrix(response, request);

    expect(model.rowCoordinates.map(({ path }) => path[0]?.value)).toEqual([userA, userB]);
    expect(model.columnCoordinates.map(({ path }) => path[0]?.value ?? 'GrandTotal')).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      'GrandTotal',
    ]);
  });

  it('places a row subtotal before its descendants while preserving leaf-first column totals', () => {
    const user = '11111111-1111-4111-8111-111111111111';
    const rowSubtotal: PivotCoordinate = {
      kind: 'Subtotal',
      path: [{ key: PIVOT_KEY.USER, value: user }],
    };
    const projectA: PivotCoordinate = {
      kind: 'Leaf',
      path: [
        { key: PIVOT_KEY.USER, value: user },
        { key: PIVOT_KEY.PROJECT, value: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      ],
    };
    const projectB: PivotCoordinate = {
      kind: 'Leaf',
      path: [
        { key: PIVOT_KEY.USER, value: user },
        { key: PIVOT_KEY.PROJECT, value: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      ],
    };
    const column: PivotCoordinate = { kind: 'Leaf', path: [] };
    const request: WorkUnitPivotQueryRequest = {
      rows: [PIVOT_KEY.USER, PIVOT_KEY.PROJECT],
      columns: [],
      values: [PIVOT_VALUE.ENTRIES_COUNT],
      filters: [],
      options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
    };
    const response: WorkUnitPivotQueryResponse = {
      cells: [projectB, rowSubtotal, projectA].map((row) => ({
        row,
        column,
        values: { entriesCount: 1 },
      })),
      filterMembers: [],
      result: { cellCount: 3, displayValueCellCount: 3, maxDisplayValueCellCount: 9_600 },
    };

    expect(buildPivotMatrix(response, request).rowCoordinates).toEqual([rowSubtotal, projectA, projectB]);
  });

  it('sorts a missing TaskKey (null) after every task id instead of throwing', () => {
    const row = (taskId: string | null): PivotCoordinate => ({
      kind: 'Leaf',
      path: [{ key: PIVOT_KEY.TASK, value: taskId }],
    });
    const request: WorkUnitPivotQueryRequest = {
      rows: [PIVOT_KEY.TASK],
      columns: [],
      values: [PIVOT_VALUE.ENTRIES_COUNT],
      filters: [],
      options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
    };
    const response: WorkUnitPivotQueryResponse = {
      cells: [row(null), row('PROJ-2'), row('PROJ-1')].map((rowCoordinate) => ({
        row: rowCoordinate,
        column: { kind: 'Leaf', path: [] },
        values: { entriesCount: 1 },
      })),
      filterMembers: [],
      result: { cellCount: 3, displayValueCellCount: 3, maxDisplayValueCellCount: 9_600 },
    };

    expect(buildPivotMatrix(response, request).rowCoordinates.map(({ path }) => path[0]?.value)).toEqual([
      'PROJ-1',
      'PROJ-2',
      null,
    ]);
  });

  it('sorts a blank task id ("") adjacent to the null no-task bucket instead of first among strings', () => {
    const row = (taskId: string | null): PivotCoordinate => ({
      kind: 'Leaf',
      path: [{ key: PIVOT_KEY.TASK, value: taskId }],
    });
    const request: WorkUnitPivotQueryRequest = {
      rows: [PIVOT_KEY.TASK],
      columns: [],
      values: [PIVOT_VALUE.ENTRIES_COUNT],
      filters: [],
      options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
    };
    const response: WorkUnitPivotQueryResponse = {
      cells: [row(''), row('PROJ-1'), row(null)].map((rowCoordinate) => ({
        row: rowCoordinate,
        column: { kind: 'Leaf', path: [] },
        values: { entriesCount: 1 },
      })),
      filterMembers: [],
      result: { cellCount: 3, displayValueCellCount: 3, maxDisplayValueCellCount: 9_600 },
    };

    expect(buildPivotMatrix(response, request).rowCoordinates.map(({ path }) => path[0]?.value)).toEqual([
      'PROJ-1',
      '',
      null,
    ]);
  });

  it('sorts a whitespace-only task id ("   ") adjacent to the null no-task bucket instead of among ordinary strings', () => {
    const row = (taskId: string | null): PivotCoordinate => ({
      kind: 'Leaf',
      path: [{ key: PIVOT_KEY.TASK, value: taskId }],
    });
    const request: WorkUnitPivotQueryRequest = {
      rows: [PIVOT_KEY.TASK],
      columns: [],
      values: [PIVOT_VALUE.ENTRIES_COUNT],
      filters: [],
      options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
    };
    const response: WorkUnitPivotQueryResponse = {
      cells: [row('   '), row('PROJ-1'), row(null)].map((rowCoordinate) => ({
        row: rowCoordinate,
        column: { kind: 'Leaf', path: [] },
        values: { entriesCount: 1 },
      })),
      filterMembers: [],
      result: { cellCount: 3, displayValueCellCount: 3, maxDisplayValueCellCount: 9_600 },
    };

    expect(buildPivotMatrix(response, request).rowCoordinates.map(({ path }) => path[0]?.value)).toEqual([
      'PROJ-1',
      '   ',
      null,
    ]);
  });

  it('places hierarchy descendants before their subtotal prefix', () => {
    const row: PivotCoordinate = { kind: 'Leaf', path: [] };
    const yearSubtotal: PivotCoordinate = {
      kind: 'Subtotal',
      path: [{ key: PIVOT_KEY.YEAR, value: 2026 }],
    };
    const july: PivotCoordinate = {
      kind: 'Leaf',
      path: [
        { key: PIVOT_KEY.YEAR, value: 2026 },
        { key: PIVOT_KEY.MONTH_YEAR, value: '2026-07' },
      ],
    };
    const august: PivotCoordinate = {
      kind: 'Leaf',
      path: [
        { key: PIVOT_KEY.YEAR, value: 2026 },
        { key: PIVOT_KEY.MONTH_YEAR, value: '2026-08' },
      ],
    };
    const grandTotal: PivotCoordinate = { kind: 'GrandTotal', path: [] };
    const request: WorkUnitPivotQueryRequest = {
      rows: [],
      columns: [PIVOT_KEY.YEAR, PIVOT_KEY.MONTH_YEAR],
      values: [PIVOT_VALUE.ENTRIES_COUNT],
      filters: [],
      options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
    };
    const response: WorkUnitPivotQueryResponse = {
      cells: [grandTotal, yearSubtotal, august, july].map((column) => ({
        row,
        column,
        values: { entriesCount: 1 },
      })),
      filterMembers: [],
      result: { cellCount: 4, displayValueCellCount: 4, maxDisplayValueCellCount: 9_600 },
    };

    expect(buildPivotMatrix(response, request).columnCoordinates).toEqual([july, august, yearSubtotal, grandTotal]);
  });
});
