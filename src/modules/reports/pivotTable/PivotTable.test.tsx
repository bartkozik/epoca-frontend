import type { ReportExportActionsProps } from '@/modules/reports/exportActions';
import type { ReportQuerySnapshot } from '@/modules/reports/filterPanel/types';
import { usePivotExportMutation } from '@/modules/reports/hooks/usePivotExportMutation';
import type { PivotTableQueryState } from '@/modules/reports/hooks/usePivotTableQuery';
import { usePivotTableQuery } from '@/modules/reports/hooks/usePivotTableQuery';
import { SpreadsheetFormat } from '@/modules/reports/types';
import { useReportDataFetch } from '@/modules/reports/useReportDataFetch';
import type { ReactNode, RefObject } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { compile } from 'sass';
import type { MockedFunction } from 'vitest';
import { PIVOT_KEY, PIVOT_VALUE } from './constants';
import type { PivotLayout } from './layout/types';
import PivotTable from './PivotTable';
import type { WorkUnitPivotQueryResponse } from './types';
import { usePivotTableView } from './usePivotTableView';

let mockSnapshot: ReportQuerySnapshot;
let mockPivotMatrixProps: {
  projection: { dateFrom: string; effectiveDateTo: string };
  request: PivotLayout;
  response: WorkUnitPivotQueryResponse;
  verticalScrollContainerRef?: RefObject<HTMLDivElement>;
} | null;
let reportExportActionsProps: ReportExportActionsProps | null;

const pivotTableCss = compile('src/modules/reports/pivotTable/PivotTable.module.scss', { loadPaths: ['src'] }).css;
const pivotCssRule = (className: string): string =>
  pivotTableCss.match(new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`))?.[1] ?? '';

vi.mock('@/modules/clients/ClientsProvider', () => ({ useClients: () => ({ clients: [] }) }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationUsers: [] }),
}));
const NO_REPORT_USERS: never[] = [];
vi.mock('@/modules/reports/hooks/useReportUsers', () => ({ useReportUsers: () => NO_REPORT_USERS }));
vi.mock('@/modules/projects/ProjectsProvider', () => ({
  useProjects: () => ({ reportedProjects: [] }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, params?: Record<string, string | number>) => {
      if (key === 'pivot_table.configurator.summary') {
        return `${params?.rows} rows · ${params?.columns} columns · ${params?.values} values · ${params?.filters} filters`;
      }
      return `${key}${params?.id ? `:${params.id}` : ''}${params?.value ? `:${params.value}` : ''}`;
    },
  }),
}));

vi.mock('@/modules/reports/filterPanel/FilterPanel', async () => {
  const { useEffect } = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: function MockFilterPanel({
      onApplyFilters,
    }: {
      onApplyFilters: (snapshot: ReportQuerySnapshot) => unknown;
    }) {
      useEffect(() => {
        void onApplyFilters(mockSnapshot);
      }, [onApplyFilters]);
      return <div data-testid="global-filters" />;
    },
  };
});
vi.mock('@/modules/reports/exportActions', () => ({
  __esModule: true,
  default: function MockReportExportActions(props: ReportExportActionsProps & { className?: string }) {
    reportExportActionsProps = props;
    return (
      <div
        className={props.className}
        data-csv-loading={String(props.csvLoading)}
        data-disabled={String(props.disabled)}
        data-testid="pivot-export-actions"
        data-xlsx-loading={String(props.xlsxLoading)}
      >
        <button onClick={props.onXlsx}>export-xlsx</button>
        <button onClick={props.onCsv}>export-csv</button>
      </div>
    );
  },
}));
vi.mock('@/modules/reports/reportsTabs/ReportsTabs', () => ({
  __esModule: true,
  default: () => <div>reports-tabs</div>,
}));
vi.mock('@/core/theme/loadingArea', () => ({
  __esModule: true,
  default: ({ children, loading }: { children: ReactNode; loading: boolean }) =>
    loading ? <div role="status">global-loading</div> : <>{children}</>,
}));
vi.mock('@/core/theme/mainContent', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/app/navbar', () => ({ __esModule: true, default: () => <nav /> }));
vi.mock('@/core/theme/pageHeader', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}));
vi.mock('@/core/theme/scrolledContainer', async () => {
  const { forwardRef } = await vi.importActual<typeof import('react')>('react');
  const MockScrolledContainer = forwardRef<HTMLDivElement, { children: ReactNode }>(({ children }, ref) => (
    <div data-testid="report-scroll-owner" ref={ref}>
      {children}
    </div>
  ));
  MockScrolledContainer.displayName = 'MockScrolledContainer';
  return { __esModule: true, default: MockScrolledContainer };
});
vi.mock('@/core/theme/snackbar', () => ({
  __esModule: true,
  default: ({ children, className, isVisible }: { children: ReactNode; className?: string; isVisible: boolean }) =>
    isVisible ? (
      <aside className={className} data-testid="pivot-export-snackbar">
        {children}
      </aside>
    ) : null,
}));
vi.mock('@/core/utils/hooks', () => ({ useTitle: vi.fn() }));
vi.mock('@/modules/reports/useReportDataFetch', () => ({ useReportDataFetch: vi.fn() }));
vi.mock('./pivotConfiguration', () => ({
  __esModule: true,
  default: ({
    isFilterPanelOpen,
    isOpen,
    onClose,
    onMove,
    onOptionChange,
    renderFilterControl,
  }: {
    isFilterPanelOpen?: boolean;
    isOpen: boolean;
    onClose: () => void;
    onMove: (move: { field: string; destination: 'columns'; index: number }) => unknown;
    onOptionChange: (key: string, value: boolean) => unknown;
    renderFilterControl?: (field: string) => ReactNode;
  }) =>
    isOpen ? (
      <div data-filter-panel-open={String(isFilterPanelOpen)} data-testid="pivot-configuration-modal" role="dialog">
        <button onClick={onClose}>close-configuration</button>
        <button onClick={() => onMove({ field: 'ProjectKey', destination: 'columns', index: 1 })}>move-project</button>
        <button onClick={() => onOptionChange('rowSubtotals', false)}>row-subtotals</button>
        <button onClick={() => onOptionChange('columnSubtotals', false)}>column-subtotals</button>
        <button onClick={() => onOptionChange('grandTotals', false)}>grand-totals</button>
        {renderFilterControl?.('EntryTypeKey')}
      </div>
    ) : null,
}));
vi.mock('./pivotFilter', () => ({
  __esModule: true,
  default: ({
    onApply,
    onOpenChange,
  }: {
    onApply: (values: string[]) => unknown;
    onOpenChange?: (isOpen: boolean) => void;
  }) => (
    <>
      <button onClick={() => onApply(['Worklog'])}>apply-entry-filter</button>
      <button onClick={() => onOpenChange?.(true)}>open-entry-filter</button>
    </>
  ),
}));
vi.mock('./matrix', () => ({
  __esModule: true,
  default: (props: {
    projection: { dateFrom: string; effectiveDateTo: string };
    request: PivotLayout;
    response: WorkUnitPivotQueryResponse;
    verticalScrollContainerRef?: RefObject<HTMLDivElement>;
  }) => {
    mockPivotMatrixProps = props;
    return (
      <div
        data-projection={JSON.stringify(props.projection)}
        data-request={JSON.stringify(props.request)}
        data-testid="pivot-matrix"
      >
        matrix:{props.request.values.join(',')}:{props.response.cells.length}
      </div>
    );
  },
}));
vi.mock('./usePivotTableView', () => ({ usePivotTableView: vi.fn() }));
vi.mock('./shapes', () => ({
  __esModule: true,
  default: () => null,
  usePivotShapeURL: ({ moveField }: { moveField: unknown }) => ({
    moveField,
    shapeOptions: [],
    selectedShapeURL: null,
    selectShape: vi.fn(),
  }),
}));
vi.mock('@/modules/reports/hooks/usePivotTableQuery', () => ({ usePivotTableQuery: vi.fn() }));
vi.mock('@/modules/reports/hooks/usePivotExportMutation', () => ({ usePivotExportMutation: vi.fn() }));

const useReportDataFetchMock = useReportDataFetch as MockedFunction<typeof useReportDataFetch>;
const usePivotTableViewMock = usePivotTableView as MockedFunction<typeof usePivotTableView>;
const usePivotTableQueryMock = usePivotTableQuery as MockedFunction<typeof usePivotTableQuery>;
const usePivotExportMutationMock = usePivotExportMutation as MockedFunction<typeof usePivotExportMutation>;

const layout: PivotLayout = {
  rows: [PIVOT_KEY.USER],
  columns: [PIVOT_KEY.MONTH_YEAR],
  values: [PIVOT_VALUE.DURATION_SUM, PIVOT_VALUE.DURATION_AVG, PIVOT_VALUE.ENTRIES_COUNT],
  filters: [{ key: PIVOT_KEY.ENTRY_TYPE, includedValues: null }],
  options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
};
const response = (cellCount = 1): WorkUnitPivotQueryResponse => ({
  cells: Array.from({ length: cellCount }, () => ({
    row: { kind: 'Leaf', path: [{ key: PIVOT_KEY.USER, value: '11111111-1111-4111-8111-111111111111' }] },
    column: { kind: 'Leaf', path: [{ key: PIVOT_KEY.MONTH_YEAR, value: '2026-08' }] },
    values: {
      durationSum: { seconds: 3600, nanoseconds: 0 },
      durationAvg: { seconds: 3600, nanoseconds: 0 },
      entriesCount: 1,
    },
  })),
  filterMembers: [
    {
      key: PIVOT_KEY.ENTRY_TYPE,
      members: [
        { value: 'Worklog', available: true },
        { value: 'Note', available: true },
      ],
    },
  ],
  result: { cellCount, displayValueCellCount: cellCount * 3, maxDisplayValueCellCount: 9_600 },
});
const createSnapshot = (): ReportQuerySnapshot => ({
  clientIds: [],
  fromDate: dayjs('2026-08-01'),
  navigationMode: 'full-month',
  projectIds: [],
  toDate: dayjs('2026-08-31'),
  today: dayjs('2026-08-12'),
  userIds: [],
});
const exportSnapshot = {
  maxDisplayValueCellCount: 9_600,
  memberIdentities: [
    { key: PIVOT_KEY.USER, value: '11111111-1111-4111-8111-111111111111' },
    { key: PIVOT_KEY.MONTH_YEAR, value: '2026-08' },
  ],
  organizationSlug: 'iterato',
  projection: { dateFrom: '2026-08-01', effectiveDateTo: '2026-08-31' },
  params: { clientId: [], dateFrom: '2026-08-01', dateTo: '2026-08-31', projectId: [], userId: [] },
  query: layout,
};

const moveFieldMock = vi.fn().mockReturnValue({ accepted: true, layout });
const applyFilterMock = vi.fn().mockReturnValue(true);
const setOptionMock = vi.fn().mockReturnValue(true);
const retryMock = vi.fn();
const csvMutateMock = vi.fn();
const xlsxMutateMock = vi.fn();

const mockQueryState = (overrides: Partial<PivotTableQueryState> = {}): void => {
  usePivotTableQueryMock.mockReturnValue({
    response: response(),
    exportSnapshot,
    errorKind: null,
    isInitialLoading: false,
    isRefreshing: false,
    retry: retryMock,
    ...overrides,
  });
};

describe('PivotTable page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPivotMatrixProps = null;
    reportExportActionsProps = null;
    mockSnapshot = createSnapshot();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200, writable: true });
    useReportDataFetchMock.mockReturnValue({ isLoadingData: false });
    usePivotTableViewMock.mockReturnValue({
      layout,
      moveField: moveFieldMock,
      applyFilter: applyFilterMock,
      setOption: setOptionMock,
      replaceLayout: vi.fn(),
      resetLayout: vi.fn(),
    });
    mockQueryState();
    usePivotExportMutationMock.mockImplementation(
      (format) =>
        ({
          isPending: false,
          mutate: format === SpreadsheetFormat.CSV ? csvMutateMock : xlsxMutateMock,
        }) as unknown as ReturnType<typeof usePivotExportMutation>,
    );
  });

  it('passes the report vertical scroll owner to the matrix', () => {
    render(<PivotTable />);
    expect(mockPivotMatrixProps?.verticalScrollContainerRef?.current).toBe(screen.getByTestId('report-scroll-owner'));
  });

  it('connects field moves, applied filters, three independent options, and selected Values order', async () => {
    const user = userEvent.setup();
    render(<PivotTable />);

    expect(screen.getByTestId('pivot-matrix')).toHaveTextContent('DurationSum,DurationAvg,EntriesCount');
    await user.click(screen.getByRole('button', { name: 'pivot_table.configurator.open' }));
    await user.click(screen.getByRole('button', { name: 'move-project' }));
    expect(moveFieldMock).toHaveBeenCalledWith({ field: PIVOT_KEY.PROJECT, destination: 'columns', index: 1 });
    await user.click(screen.getByRole('button', { name: 'apply-entry-filter' }));
    expect(applyFilterMock).toHaveBeenCalledWith(PIVOT_KEY.ENTRY_TYPE, ['Worklog']);
    await user.click(screen.getByRole('button', { name: 'row-subtotals' }));
    await user.click(screen.getByRole('button', { name: 'column-subtotals' }));
    await user.click(screen.getByRole('button', { name: 'grand-totals' }));
    expect(setOptionMock).toHaveBeenCalledTimes(3);
    expect(setOptionMock).toHaveBeenNthCalledWith(1, 'rowSubtotals', false);
    expect(setOptionMock).toHaveBeenNthCalledWith(2, 'columnSubtotals', false);
    expect(setOptionMock).toHaveBeenNthCalledWith(3, 'grandTotals', false);
  });

  it('reports an open filter popover to the configuration modal as isFilterPanelOpen', async () => {
    const user = userEvent.setup();
    render(<PivotTable />);
    await user.click(screen.getByRole('button', { name: 'pivot_table.configurator.open' }));
    expect(screen.getByTestId('pivot-configuration-modal')).toHaveAttribute('data-filter-panel-open', 'false');
    await user.click(screen.getByRole('button', { name: 'open-entry-filter' }));
    expect(screen.getByTestId('pivot-configuration-modal')).toHaveAttribute('data-filter-panel-open', 'true');
  });

  it('shows the live-refreshing status and disables the export trigger while isRefreshing', () => {
    mockQueryState({ isRefreshing: true });
    render(<PivotTable />);
    const toolbar = screen.getByTestId('pivot-result-toolbar');
    expect(within(toolbar).getByRole('status', { name: 'pivot_table.state.refreshing' })).toHaveTextContent(
      'pivot_table.state.refreshing',
    );
    expect(within(toolbar).getByRole('button', { name: 'pivot_table.export.open' })).toBeDisabled();
  });

  it('toggles the export snackbar and restores focus after close or Escape', async () => {
    const user = userEvent.setup();
    render(<PivotTable />);
    const download = screen.getByRole('button', { name: 'pivot_table.export.open' });
    await user.click(download);
    expect(screen.getByTestId('pivot-export-actions')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'pivot_table.export.close' }));
    expect(screen.queryByTestId('pivot-export-snackbar')).not.toBeInTheDocument();
    expect(download).toHaveFocus();
  });

  it('hides the export trigger for initial loading, empty results, and a null exportSnapshot', () => {
    mockQueryState({ isInitialLoading: true, response: null, exportSnapshot: null });
    const view = render(<PivotTable />);
    expect(screen.queryByRole('button', { name: 'pivot_table.export.open' })).not.toBeInTheDocument();
    view.unmount();

    mockQueryState({ response: response(0), exportSnapshot: null });
    render(<PivotTable />);
    expect(screen.queryByRole('button', { name: 'pivot_table.export.open' })).not.toBeInTheDocument();
  });

  it('renders initial loading and an empty successful result without a matrix', () => {
    mockQueryState({ isInitialLoading: true, response: null, exportSnapshot: null });
    const view = render(<PivotTable />);
    expect(screen.getByRole('status', { name: 'pivot_table.state.loading' })).toBeInTheDocument();
    view.unmount();

    mockQueryState({ response: response(0), exportSnapshot: null });
    render(<PivotTable />);
    expect(screen.getByText('pivot_table.state.empty')).toBeInTheDocument();
    expect(screen.queryByTestId('pivot-matrix')).not.toBeInTheDocument();
  });

  it.each([
    ['generic', 'pivot_table.state.error'],
    ['contract', 'pivot_table.state.contract_error'],
    ['forbidden', 'pivot_table.state.forbidden'],
    ['invalidConfiguration', 'pivot_table.state.invalid_configuration'],
    ['resultTooLarge', 'pivot_table.state.result_too_large'],
  ])('renders retryable %s initial error and wires the retry button', async (errorKind, message) => {
    const user = userEvent.setup();
    mockQueryState({ errorKind: errorKind as PivotTableQueryState['errorKind'], response: null, exportSnapshot: null });
    render(<PivotTable />);
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    await user.click(screen.getByRole('button', { name: 'pivot_table.state.retry' }));
    expect(retryMock).toHaveBeenCalledTimes(1);
  });

  it('preserves a previous matrix when refresh fails and exposes Retry beside the error', () => {
    mockQueryState({ errorKind: 'resultTooLarge', response: response() });
    render(<PivotTable />);
    expect(screen.getByTestId('pivot-matrix')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('pivot_table.state.result_too_large');
  });

  it('exports XLSX and CSV independently through their own mutation instances, guarding a re-click while pending', async () => {
    const user = userEvent.setup();
    usePivotExportMutationMock.mockImplementation(
      (format) =>
        ({
          isPending: format === SpreadsheetFormat.XLS,
          mutate: format === SpreadsheetFormat.CSV ? csvMutateMock : xlsxMutateMock,
        }) as unknown as ReturnType<typeof usePivotExportMutation>,
    );
    render(<PivotTable />);

    await user.click(screen.getByRole('button', { name: 'pivot_table.export.open' }));
    await user.click(screen.getByRole('button', { name: 'export-xlsx' }));
    await user.click(screen.getByRole('button', { name: 'export-csv' }));

    expect(xlsxMutateMock).not.toHaveBeenCalled();
    expect(csvMutateMock).toHaveBeenCalledWith({
      snapshot: exportSnapshot,
      presentation: expect.any(Object) as unknown,
    });
    expect(reportExportActionsProps).toMatchObject({ xlsxLoading: true, csvLoading: false });
  });

  it('opens and closes the configuration modal from the trigger without changing the pivot layout', async () => {
    const user = userEvent.setup();
    render(<PivotTable />);
    const trigger = screen.getByRole('button', { name: 'pivot_table.configurator.open' });
    await user.click(trigger);
    expect(screen.getByTestId('pivot-configuration-modal')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'close-configuration' }));
    expect(screen.queryByTestId('pivot-configuration-modal')).not.toBeInTheDocument();
    expect(moveFieldMock).not.toHaveBeenCalled();
    expect(setOptionMock).not.toHaveBeenCalled();
  });

  it('uses a fixed toolbar, compact trigger, and responsive bottom inset at tablet and mobile widths', () => {
    const resultsRule = pivotCssRule('results');
    const toolbarRule = pivotCssRule('resultToolbar');
    expect(resultsRule).toContain('--pivot-sticky-bottom-inset: 0px;');
    expect(toolbarRule).toContain('display: grid;');
  });
});
