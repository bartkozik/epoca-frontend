import { isAxiosError, showToastForError } from '@/core/utils/helpers';
import { downloadSpreadsheet } from '@/modules/reports/downloadSpreadsheet';
import { useReportExportMutation } from '@/modules/reports/hooks/useReportExportMutation';
import * as requests from '@/modules/reports/requests';
import { SpreadsheetFormat } from '@/modules/reports/types';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import type { MockedFunction } from 'vitest';

vi.mock('@/core/providers/toastProvider', () => ({ useToast: () => ({ addToast: addToastMock }) }));
vi.mock('@/modules/reports/downloadSpreadsheet', () => ({ downloadSpreadsheet: vi.fn() }));
vi.mock('@/modules/reports/requests', async () => ({
  ...(await vi.importActual<typeof import('@/modules/reports/requests')>('@/modules/reports/requests')),
  exportReport: vi.fn(),
}));
vi.mock('i18next', () => ({ __esModule: true, default: { t: (key: string) => key } }));
vi.mock('@/core/utils/helpers', () => ({ isAxiosError: vi.fn(), showToastForError: vi.fn() }));

const downloadSpreadsheetMock = downloadSpreadsheet as MockedFunction<typeof downloadSpreadsheet>;
const exportReportMock = requests.exportReport as MockedFunction<typeof requests.exportReport>;
const isAxiosErrorMock = isAxiosError as MockedFunction<typeof isAxiosError>;
const showToastForErrorMock = showToastForError as MockedFunction<typeof showToastForError>;
const addToastMock = vi.fn();

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.clearAllMocks();
  isAxiosErrorMock.mockReturnValue(false);
});

describe('useReportExportMutation', () => {
  it('exports selected rows and downloads with a single-month filename', async () => {
    const data = new Blob();
    exportReportMock.mockResolvedValueOnce({ data } as Awaited<ReturnType<typeof requests.exportReport>>);

    const { result } = renderHook(() => useReportExportMutation(), { wrapper });
    result.current.mutate({
      format: SpreadsheetFormat.CSV,
      organizationSlug: 'acme',
      selectedUnitIds: ['unit-1'],
      selectedFromDate: dayjs('2026-07-01'),
      selectedToDate: null,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(exportReportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        format: SpreadsheetFormat.CSV,
        organizationSlug: 'acme',
        selectedUnitIds: ['unit-1'],
      }),
    );
    expect(downloadSpreadsheetMock).toHaveBeenCalledWith(data, 'reported_hours_2026-07.csv', SpreadsheetFormat.CSV);
  });

  it('uses a two-month filename and .xlsx extension for XLS across month boundaries', async () => {
    const data = new Blob();
    exportReportMock.mockResolvedValueOnce({ data } as Awaited<ReturnType<typeof requests.exportReport>>);

    const { result } = renderHook(() => useReportExportMutation(), { wrapper });
    result.current.mutate({
      format: SpreadsheetFormat.XLS,
      organizationSlug: 'acme',
      selectedUnitIds: ['unit-2', 'unit-1'],
      selectedFromDate: dayjs('2026-07-01'),
      selectedToDate: dayjs('2026-08-31'),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(downloadSpreadsheetMock).toHaveBeenCalledWith(
      data,
      'reported_hours_2026-07_2026-08.xlsx',
      SpreadsheetFormat.XLS,
    );
  });

  it('shows the generic export-failed toast for an axios error', async () => {
    const error = Object.assign(new Error('failed'), { isAxiosError: true, response: { status: 500 } });
    isAxiosErrorMock.mockReturnValue(true);
    exportReportMock.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useReportExportMutation(), { wrapper });
    result.current.mutate({
      format: SpreadsheetFormat.CSV,
      organizationSlug: 'acme',
      selectedUnitIds: ['unit-1'],
      selectedFromDate: dayjs('2026-07-01'),
      selectedToDate: null,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(showToastForErrorMock).toHaveBeenCalledWith({
      errorMessageMap: {
        default: 'toast_message.report.report_export_failed',
        500: 'toast_message.report.report_export_failed',
      },
      error,
    });
    expect(addToastMock).not.toHaveBeenCalled();
    expect(downloadSpreadsheetMock).not.toHaveBeenCalled();
  });

  it('shows a generic toast for a non-axios error', async () => {
    exportReportMock.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useReportExportMutation(), { wrapper });
    result.current.mutate({
      format: SpreadsheetFormat.CSV,
      organizationSlug: 'acme',
      selectedUnitIds: ['unit-1'],
      selectedFromDate: dayjs('2026-07-01'),
      selectedToDate: null,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(addToastMock).toHaveBeenCalledWith({ content: 'toast_message.report.report_export_failed', type: 'error' });
    expect(showToastForErrorMock).not.toHaveBeenCalled();
  });
});
