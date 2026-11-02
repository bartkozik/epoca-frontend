import type { ReportQuerySnapshot } from '@/modules/reports/filterPanel/types';
import { usePivotTableQuery } from '@/modules/reports/hooks/usePivotTableQuery';
import { parsePivotResponse } from '@/modules/reports/models/pivotTableQuery.model';
import { PIVOT_KEY, PIVOT_VALUE } from '@/modules/reports/pivotTable/constants';
import type { WorkUnitPivotQueryRequest, WorkUnitPivotQueryResponse } from '@/modules/reports/pivotTable/types';
import { pivotTableQueryKey } from '@/modules/reports/queryKeys';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import type { MockedFunction } from 'vitest';
import { DEFAULT_PIVOT_LAYOUT } from '../pivotTable/layout/pivotLayout';
import { PivotResultTooLargeError } from '../pivotTable/matrix/completeMonthAxis';
import * as requests from '../requests';
import canonicalResponse from './__fixtures__/work-unit-pivot-query-canonical-response.json';

vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));
// Not spread over `vi.importActual`: `requests.ts` imports `parsePivotResponse` from THIS file,
// so importActual-ing it back here would re-enter this module mid-evaluation (a real circular
// mock deadlock, not just a lint nit) -- a plain stub avoids it, matching how
// `clients/models/clientList.model.test.ts` mocks its sibling `requests` module.
vi.mock('../requests', () => ({ getPivotTable: vi.fn() }));

const getPivotTableMock = requests.getPivotTable as MockedFunction<typeof requests.getPivotTable>;

const filters = (fromDate = '2026-07-01'): ReportQuerySnapshot => ({
  clientIds: ['client-1'],
  fromDate: dayjs(fromDate),
  navigationMode: 'full-month',
  projectIds: ['project-1'],
  toDate: dayjs(fromDate).endOf('month'),
  today: dayjs('2026-08-12'),
  userIds: ['user-1'],
});

const pivotQueryResponse = (cellCount = 1): WorkUnitPivotQueryResponse => ({
  cells: Array.from({ length: cellCount }, () => ({
    row: { kind: 'Leaf', path: [{ key: PIVOT_KEY.USER, value: 'user-1' }] },
    column: { kind: 'Leaf', path: [] },
    values: { durationSum: { seconds: 3600, nanoseconds: 0 } },
  })),
  filterMembers: [],
  result: { cellCount, displayValueCellCount: cellCount, maxDisplayValueCellCount: 9_600 },
});

// createElement instead of JSX: this file stays `.ts` (matching this repo's
// check-file/filename-naming-convention), so it can't use JSX syntax, which only parses in `.tsx`.
// `queryClient` is a module-level variable reassigned in `beforeEach` (not created inside the
// wrapper body) so it stays the SAME instance across every rerender within one test.
let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
});

const canonicalRequest: WorkUnitPivotQueryRequest = {
  rows: [PIVOT_KEY.USER, PIVOT_KEY.PROJECT],
  columns: [PIVOT_KEY.MONTH_YEAR],
  values: [PIVOT_VALUE.DURATION_SUM, PIVOT_VALUE.DURATION_AVG, PIVOT_VALUE.ENTRIES_COUNT],
  filters: [],
  options: {
    rowSubtotals: true,
    columnSubtotals: true,
    grandTotals: true,
  },
};

describe('parsePivotResponse', () => {
  it('parses the CT-535 canonical sparse response without recalculating its cells', () => {
    const response = parsePivotResponse(canonicalResponse, canonicalRequest);

    expect(response.cells).toHaveLength(11);
    expect(new Set(response.cells.map(({ row }) => JSON.stringify(row))).size).toBe(4);
    expect(new Set(response.cells.map(({ column }) => JSON.stringify(column))).size).toBe(3);
    expect(response.filterMembers).toEqual([]);
    expect(response.result).toEqual({
      cellCount: 11,
      displayValueCellCount: 36,
      maxDisplayValueCellCount: 9_600,
    });
    expect(response.cells[0].values).toEqual({
      durationSum: { seconds: 7_200, nanoseconds: 0 },
      durationAvg: { seconds: 7_200, nanoseconds: 0 },
      entriesCount: 1,
    });

    const sparseProjectAugust = response.cells.find(
      ({ row, column }) =>
        row.path[1]?.value === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' && column.path[0]?.value === '2026-08',
    );
    expect(sparseProjectAugust).toBeUndefined();
  });

  it('rejects display metadata that does not describe the rendered rectangular matrix', () => {
    const invalidResponse = {
      ...canonicalResponse,
      result: { ...canonicalResponse.result, displayValueCellCount: 35 },
    };

    expect(() => parsePivotResponse(invalidResponse, canonicalRequest)).toThrow(
      'displayValueCellCount does not match the coordinate matrix',
    );
  });

  it('rejects a response that silently drops an applied unavailable filter member', () => {
    const request: WorkUnitPivotQueryRequest = {
      ...canonicalRequest,
      filters: [{ key: PIVOT_KEY.ENTRY_TYPE, includedValues: ['Note'] }],
    };
    const invalidResponse = {
      ...canonicalResponse,
      filterMembers: [
        {
          key: PIVOT_KEY.ENTRY_TYPE,
          members: [{ value: 'Worklog', available: true }],
        },
      ],
    };

    expect(() => parsePivotResponse(invalidResponse, request)).toThrow(
      'selected EntryTypeKey filter member is missing',
    );
  });

  it('rejects an unavailable facet member that was not selected in the request', () => {
    const request: WorkUnitPivotQueryRequest = {
      ...canonicalRequest,
      filters: [{ key: PIVOT_KEY.ENTRY_TYPE, includedValues: ['Worklog'] }],
    };
    const invalidResponse = {
      ...canonicalResponse,
      filterMembers: [
        {
          key: PIVOT_KEY.ENTRY_TYPE,
          members: [
            { value: 'Worklog', available: true },
            { value: 'Note', available: false },
          ],
        },
      ],
    };

    expect(() => parsePivotResponse(invalidResponse, request)).toThrow(
      'unavailable EntryTypeKey filter member was not selected',
    );
  });

  it('accepts a requested null duration average for a Note-only structural cell', () => {
    const request: WorkUnitPivotQueryRequest = {
      rows: [],
      columns: [],
      values: [PIVOT_VALUE.DURATION_AVG],
      filters: [],
      options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
    };
    const response = parsePivotResponse(
      {
        cells: [
          {
            row: { kind: 'Leaf', path: [] },
            column: { kind: 'Leaf', path: [] },
            values: { durationAvg: null },
          },
        ],
        filterMembers: [],
        result: { cellCount: 1, displayValueCellCount: 1, maxDisplayValueCellCount: 9_600 },
      },
      request,
    );

    expect(response.cells[0].values).toEqual({ durationAvg: null });
  });

  it.each([
    [
      'a noncanonical UUID',
      {
        ...canonicalResponse,
        cells: canonicalResponse.cells.map((cell, index) =>
          index === 0
            ? {
                ...cell,
                row: {
                  ...cell.row,
                  path: [{ ...cell.row.path[0], value: '1-1-1-1-1' }, ...cell.row.path.slice(1)],
                },
              }
            : cell,
        ),
      },
      'Invalid pivot response',
    ],
    [
      'an invalid calendar month',
      {
        ...canonicalResponse,
        cells: canonicalResponse.cells.map((cell, index) =>
          index === 0
            ? {
                ...cell,
                column: {
                  ...cell.column,
                  path: [{ ...cell.column.path[0], value: '2026-13' }],
                },
              }
            : cell,
        ),
      },
      'Invalid pivot response',
    ],
    [
      'a full-length Subtotal path',
      {
        ...canonicalResponse,
        cells: canonicalResponse.cells.map((cell, index) =>
          index === 0 ? { ...cell, row: { ...cell.row, kind: 'Subtotal' } } : cell,
        ),
      },
      'Invalid pivot response',
    ],
    [
      'a non-prefix path key',
      {
        ...canonicalResponse,
        cells: canonicalResponse.cells.map((cell, index) =>
          index === 0
            ? {
                ...cell,
                row: {
                  ...cell.row,
                  path: [{ ...cell.row.path[0], key: PIVOT_KEY.DATE }, ...cell.row.path.slice(1)],
                },
              }
            : cell,
        ),
      },
      'Invalid pivot response',
    ],
    [
      'a negative entry count',
      {
        ...canonicalResponse,
        cells: canonicalResponse.cells.map((cell, index) =>
          index === 0 ? { ...cell, values: { ...cell.values, entriesCount: -1 } } : cell,
        ),
      },
      'Number must be greater than or equal to 0',
    ],
    [
      'a malformed duration',
      {
        ...canonicalResponse,
        cells: canonicalResponse.cells.map((cell, index) =>
          index === 0 ? { ...cell, values: { ...cell.values, durationAvg: 'P1Y' } } : cell,
        ),
      },
      'Invalid pivot duration',
    ],
    [
      'a duplicate coordinate pair',
      {
        ...canonicalResponse,
        cells: [...canonicalResponse.cells, canonicalResponse.cells[0]],
        result: { ...canonicalResponse.result, cellCount: 12 },
      },
      'Invalid pivot response',
    ],
    [
      'a mismatched cell count',
      {
        ...canonicalResponse,
        result: { ...canonicalResponse.result, cellCount: 10 },
      },
      'Invalid pivot response',
    ],
  ])('rejects %s', (_caseName, invalidResponse, expectedError) => {
    expect(() => parsePivotResponse(invalidResponse, canonicalRequest)).toThrow(expectedError);
  });

  it('rejects missing requested metrics and extra unrequested metrics', () => {
    const firstCell = canonicalResponse.cells[0];
    const missingMetricResponse = {
      ...canonicalResponse,
      cells: [
        {
          ...firstCell,
          values: {
            durationSum: firstCell.values.durationSum,
            entriesCount: firstCell.values.entriesCount,
          },
        },
        ...canonicalResponse.cells.slice(1),
      ],
    };

    expect(() => parsePivotResponse(missingMetricResponse, canonicalRequest)).toThrow(
      'metric durationAvg does not match requested Values',
    );

    const sumOnlyRequest: WorkUnitPivotQueryRequest = {
      ...canonicalRequest,
      values: [PIVOT_VALUE.DURATION_SUM],
    };
    expect(() => parsePivotResponse(canonicalResponse, sumOnlyRequest)).toThrow(
      'metric durationAvg does not match requested Values',
    );
  });

  it('accepts a TaskKey facet with both a raw task id and the no-task null bucket', () => {
    const request: WorkUnitPivotQueryRequest = {
      ...canonicalRequest,
      filters: [{ key: PIVOT_KEY.TASK, includedValues: ['PROJ-1', null] }],
    };
    const response = {
      ...canonicalResponse,
      filterMembers: [
        {
          key: PIVOT_KEY.TASK,
          members: [
            { value: 'PROJ-1', available: true },
            { value: null, available: true },
          ],
        },
      ],
    };

    expect(parsePivotResponse(response, request).filterMembers).toEqual([
      {
        key: PIVOT_KEY.TASK,
        members: [
          { value: 'PROJ-1', available: true },
          { value: null, available: true },
        ],
      },
    ]);
  });

  it('rejects a TaskKey facet member of the wrong type', () => {
    const request: WorkUnitPivotQueryRequest = {
      ...canonicalRequest,
      filters: [{ key: PIVOT_KEY.TASK, includedValues: [2026] }],
    };
    const response = {
      ...canonicalResponse,
      filterMembers: [{ key: PIVOT_KEY.TASK, members: [{ value: 2026, available: true }] }],
    };

    expect(() => parsePivotResponse(response, request)).toThrow('invalid TaskKey value');
  });

  it('rejects duplicate and wrong-typed facet members', () => {
    const request: WorkUnitPivotQueryRequest = {
      ...canonicalRequest,
      filters: [{ key: PIVOT_KEY.YEAR, includedValues: [2026] }],
    };
    const duplicateResponse = {
      ...canonicalResponse,
      filterMembers: [
        {
          key: PIVOT_KEY.YEAR,
          members: [
            { value: 2026, available: true },
            { value: 2026, available: true },
          ],
        },
      ],
    };
    const wrongTypeResponse = {
      ...canonicalResponse,
      filterMembers: [
        {
          key: PIVOT_KEY.YEAR,
          members: [{ value: '2026', available: true }],
        },
      ],
    };

    expect(() => parsePivotResponse(duplicateResponse, request)).toThrow('duplicate YearKey filter member');
    expect(() => parsePivotResponse(wrongTypeResponse, request)).toThrow('invalid YearKey value');
  });
});

describe('pivotTableQueryKey', () => {
  it('is flat, entity-prefixed, and serializes the accepted layout and filters', () => {
    expect(pivotTableQueryKey('acme', DEFAULT_PIVOT_LAYOUT, null)).toEqual([
      'pivotTable',
      'acme',
      JSON.stringify({
        rows: DEFAULT_PIVOT_LAYOUT.rows,
        columns: DEFAULT_PIVOT_LAYOUT.columns,
        values: DEFAULT_PIVOT_LAYOUT.values,
        filters: DEFAULT_PIVOT_LAYOUT.filters,
        options: DEFAULT_PIVOT_LAYOUT.options,
      }),
      'no-filters',
    ]);
  });
});

describe('usePivotTableQuery', () => {
  it('is disabled until filters are supplied', () => {
    const { result } = renderHook(() => usePivotTableQuery(DEFAULT_PIVOT_LAYOUT, null), { wrapper });
    expect(getPivotTableMock).not.toHaveBeenCalled();
    expect(result.current.isInitialLoading).toBe(false);
  });

  it('fetches and exposes a non-empty result as an exportable snapshot', async () => {
    getPivotTableMock.mockResolvedValueOnce(pivotQueryResponse(1));
    const { result } = renderHook(() => usePivotTableQuery(DEFAULT_PIVOT_LAYOUT, filters()), { wrapper });

    expect(result.current.isInitialLoading).toBe(true);
    await waitFor(() => expect(result.current.response).not.toBeNull());
    expect(result.current.exportSnapshot).toMatchObject({ organizationSlug: 'acme', maxDisplayValueCellCount: 9_600 });
    expect(result.current.errorKind).toBeNull();
    expect(result.current.isRefreshing).toBe(false);
  });

  it('returns a null exportSnapshot for an empty successful result', async () => {
    getPivotTableMock.mockResolvedValueOnce(pivotQueryResponse(0));
    const { result } = renderHook(() => usePivotTableQuery(DEFAULT_PIVOT_LAYOUT, filters()), { wrapper });

    await waitFor(() => expect(result.current.response).not.toBeNull());
    expect(result.current.response?.cells).toHaveLength(0);
    expect(result.current.exportSnapshot).toBeNull();
  });

  it('keeps the previous accepted response and snapshot visible when a later, different-key fetch fails', async () => {
    getPivotTableMock.mockResolvedValueOnce(pivotQueryResponse(1));
    const { result, rerender } = renderHook(
      ({ layout, snapshot }: { layout: typeof DEFAULT_PIVOT_LAYOUT; snapshot: ReportQuerySnapshot }) =>
        usePivotTableQuery(layout, snapshot),
      { initialProps: { layout: DEFAULT_PIVOT_LAYOUT, snapshot: filters() }, wrapper },
    );
    await waitFor(() => expect(result.current.response).not.toBeNull());
    const previousResponse = result.current.response;
    const previousSnapshot = result.current.exportSnapshot;

    getPivotTableMock.mockRejectedValueOnce(new PivotResultTooLargeError(20_000, 9_600));
    rerender({ layout: DEFAULT_PIVOT_LAYOUT, snapshot: filters('2026-08-01') });

    await waitFor(() => expect(result.current.errorKind).toBe('resultTooLarge'));
    expect(result.current.response).toBe(previousResponse);
    expect(result.current.exportSnapshot).toBe(previousSnapshot);
  });

  it('reports isRefreshing (not isInitialLoading) once an accepted response already exists', async () => {
    getPivotTableMock.mockResolvedValueOnce(pivotQueryResponse(1));
    const { result, rerender } = renderHook(
      ({ layout }: { layout: typeof DEFAULT_PIVOT_LAYOUT }) => usePivotTableQuery(layout, filters()),
      { initialProps: { layout: DEFAULT_PIVOT_LAYOUT }, wrapper },
    );
    await waitFor(() => expect(result.current.response).not.toBeNull());

    let resolveSecond!: (value: WorkUnitPivotQueryResponse) => void;
    getPivotTableMock.mockReturnValueOnce(new Promise((resolve) => (resolveSecond = resolve)));
    rerender({ layout: { ...DEFAULT_PIVOT_LAYOUT, options: { ...DEFAULT_PIVOT_LAYOUT.options, grandTotals: false } } });

    await waitFor(() => expect(result.current.isRefreshing).toBe(true));
    expect(result.current.isInitialLoading).toBe(false);
    resolveSecond(pivotQueryResponse(2));
    await waitFor(() => expect(result.current.response?.cells).toHaveLength(2));
    expect(result.current.isRefreshing).toBe(false);
  });

  it('calls refetch on retry', async () => {
    getPivotTableMock.mockResolvedValue(pivotQueryResponse(1));
    const { result } = renderHook(() => usePivotTableQuery(DEFAULT_PIVOT_LAYOUT, filters()), { wrapper });
    await waitFor(() => expect(result.current.response).not.toBeNull());

    getPivotTableMock.mockClear();
    result.current.retry();
    await waitFor(() => expect(getPivotTableMock).toHaveBeenCalledTimes(1));
  });

  it.each([
    [{ isAxiosError: true, response: { status: 403 } }, 'forbidden'],
    [
      { isAxiosError: true, response: { status: 400, data: { code: 'PIVOT_INVALID_CONFIGURATION' } } },
      'invalidConfiguration',
    ],
    [{ isAxiosError: true, response: { status: 422, data: { code: 'PIVOT_RESULT_TOO_LARGE' } } }, 'resultTooLarge'],
    [new Error('Invalid pivot response: duplicate coordinate pair'), 'contract'],
    [new Error('network down'), 'generic'],
  ])('maps a failure to errorKind %#', async (error, expectedKind) => {
    getPivotTableMock.mockRejectedValueOnce(error);
    const { result } = renderHook(() => usePivotTableQuery(DEFAULT_PIVOT_LAYOUT, filters()), { wrapper });
    await waitFor(() => expect(result.current.errorKind).toBe(expectedKind));
  });
});
