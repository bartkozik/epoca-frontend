import { isAxiosError, showToastForError } from '@/core/utils/helpers';
import { downloadSpreadsheet } from '@/modules/reports/downloadSpreadsheet';
import { usePivotExportMutation } from '@/modules/reports/hooks/usePivotExportMutation';
import { PIVOT_KEY, PIVOT_VALUE } from '@/modules/reports/pivotTable/constants';
import { PivotExportBudgetMismatchError } from '@/modules/reports/pivotTable/pivotExport';
import type { PivotExportPresentation, PivotExportSnapshot } from '@/modules/reports/pivotTable/types';
import * as requests from '@/modules/reports/requests';
import { SpreadsheetFormat } from '@/modules/reports/types';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { MockedFunction } from 'vitest';

vi.mock('@/core/providers/toastProvider', () => ({ useToast: () => ({ addToast: addToastMock }) }));
vi.mock('@/modules/reports/downloadSpreadsheet', () => ({ downloadSpreadsheet: vi.fn() }));
vi.mock('@/modules/reports/requests', () => ({ exportPivotTable: vi.fn() }));
vi.mock('i18next', () => ({ __esModule: true, default: { t: (key: string) => key } }));
vi.mock('@/core/utils/helpers', () => ({ isAxiosError: vi.fn(), showToastForError: vi.fn() }));

const exportPivotTableMock = requests.exportPivotTable as MockedFunction<typeof requests.exportPivotTable>;
const downloadSpreadsheetMock = downloadSpreadsheet as MockedFunction<typeof downloadSpreadsheet>;
const isAxiosErrorMock = isAxiosError as MockedFunction<typeof isAxiosError>;
const showToastForErrorMock = showToastForError as MockedFunction<typeof showToastForError>;
const addToastMock = vi.fn();

const snapshot: PivotExportSnapshot = {
  organizationSlug: 'acme',
  projection: { dateFrom: '2026-07-01', effectiveDateTo: '2026-07-31' },
  query: {
    rows: [],
    columns: [],
    values: [],
    filters: [],
    options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
  },
  params: { clientId: [], dateFrom: '2026-07-01', projectId: [], userId: [] },
  memberIdentities: [],
  maxDisplayValueCellCount: 9_600,
};
// A real (not stubbed-out) presentation object: the mutation hook calls the real
// `serializePivotExportRequest`, which canonicalizes and validates every field, so an
// under-specified fixture (e.g. `{}`) throws a TypeError before `requests.exportPivotTable` is
// ever reached.
const presentation: PivotExportPresentation = {
  fieldLabels: {
    [PIVOT_KEY.USER]: 'User',
    [PIVOT_KEY.PROJECT]: 'Project',
    [PIVOT_KEY.CLIENT]: 'Client',
    [PIVOT_KEY.YEAR]: 'Year',
    [PIVOT_KEY.MONTH_YEAR]: 'Month',
    [PIVOT_KEY.DATE]: 'Date',
    [PIVOT_KEY.ENTRY_TYPE]: 'Entry type',
  },
  measureLabels: {
    [PIVOT_VALUE.DURATION_SUM]: 'Duration',
    [PIVOT_VALUE.DURATION_AVG]: 'Average duration',
    [PIVOT_VALUE.ENTRIES_COUNT]: 'Entries',
  },
  subtotalLabel: 'Subtotal',
  grandTotalLabel: 'Grand total',
  noClientLabel: 'No client',
  memberLabels: [],
};

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
  isAxiosErrorMock.mockReturnValue(false);
});

describe('usePivotExportMutation', () => {
  it('downloads the spreadsheet on a successful non-empty export', async () => {
    exportPivotTableMock.mockResolvedValueOnce({
      data: new Blob(['xlsx']),
      status: 200,
    } as Awaited<ReturnType<typeof requests.exportPivotTable>>);
    const { result } = renderHook(() => usePivotExportMutation(SpreadsheetFormat.XLS), { wrapper });

    result.current.mutate({ snapshot, presentation });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(downloadSpreadsheetMock).toHaveBeenCalledTimes(1);
    expect(addToastMock).not.toHaveBeenCalled();
  });

  it('shows the empty-export toast for a 204 without downloading', async () => {
    exportPivotTableMock.mockResolvedValueOnce({
      data: null,
      status: 204,
    } as unknown as Awaited<ReturnType<typeof requests.exportPivotTable>>);
    const { result } = renderHook(() => usePivotExportMutation(SpreadsheetFormat.CSV), { wrapper });

    result.current.mutate({ snapshot, presentation });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(downloadSpreadsheetMock).not.toHaveBeenCalled();
    expect(addToastMock).toHaveBeenCalledWith({ content: 'toast_message.report.pivot_table_export_empty' });
  });

  it('shows the budget-mismatch toast for that specific error, not the generic one', async () => {
    exportPivotTableMock.mockRejectedValueOnce(new PivotExportBudgetMismatchError('budget mismatch'));
    const { result } = renderHook(() => usePivotExportMutation(SpreadsheetFormat.XLS), { wrapper });

    result.current.mutate({ snapshot, presentation });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(addToastMock).toHaveBeenCalledWith({
      content: 'toast_message.report.pivot_table_export_budget_mismatch',
      type: 'error',
    });
    expect(showToastForErrorMock).not.toHaveBeenCalled();
  });

  it('shows the generic export-failed toast for an axios error', async () => {
    const error = Object.assign(new Error('failed'), { isAxiosError: true, response: { status: 500 } });
    isAxiosErrorMock.mockReturnValue(true);
    exportPivotTableMock.mockRejectedValueOnce(error);
    const { result } = renderHook(() => usePivotExportMutation(SpreadsheetFormat.CSV), { wrapper });

    result.current.mutate({ snapshot, presentation });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(showToastForErrorMock).toHaveBeenCalledWith({
      errorMessageMap: {
        default: 'toast_message.report.report_export_failed',
        500: 'toast_message.report.report_export_failed',
      },
      error,
    });
    expect(addToastMock).not.toHaveBeenCalled();
  });

  it('tracks CSV and XLSX pending state independently across two hook instances', async () => {
    let resolveXlsx!: (value: Awaited<ReturnType<typeof requests.exportPivotTable>>) => void;
    exportPivotTableMock.mockReturnValueOnce(new Promise((resolve) => (resolveXlsx = resolve)));
    const { result: xlsxResult } = renderHook(() => usePivotExportMutation(SpreadsheetFormat.XLS), { wrapper });
    const { result: csvResult } = renderHook(() => usePivotExportMutation(SpreadsheetFormat.CSV), { wrapper });

    xlsxResult.current.mutate({ snapshot, presentation });
    await waitFor(() => expect(xlsxResult.current.isPending).toBe(true));
    expect(csvResult.current.isPending).toBe(false);

    resolveXlsx({ data: new Blob(['xlsx']), status: 200 } as Awaited<ReturnType<typeof requests.exportPivotTable>>);
    await waitFor(() => expect(xlsxResult.current.isPending).toBe(false));
  });
});
