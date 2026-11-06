import { useReportExportMutation, type ExportReportInput } from '@/modules/reports/hooks/useReportExportMutation';
import { type ReportedUnit } from '@/modules/workingTime/types';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import type { Mock, MockedFunction } from 'vitest';
import { buildFilters } from '../../filterPanel/reportFiltersTestFixtures';
import ReportBoard from './ReportBoard';

vi.mock('@/modules/reports/hooks/useReportExportMutation', () => ({ useReportExportMutation: vi.fn() }));

let workspace: ReturnType<typeof createWorkspace>;
let organizationSlug = 'acme';
vi.mock('@/modules/workingTime/UnitWorkspaceProvider', () => ({ useUnitWorkspace: () => workspace }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: organizationSlug }),
}));

const addToastMock = vi.hoisted(() => vi.fn());
vi.mock('@/core/providers/toastProvider', () => ({ useToast: () => ({ addToast: addToastMock }) }));

const translationI18n = vi.hoisted(() => ({ language: 'en', resolvedLanguage: 'en' }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: translationI18n,
    t: (key: string) => key,
  }),
}));

vi.mock('@/core/theme/loadingArea', () => ({
  __esModule: true,
  default: ({ children, loading }: { children?: ReactNode; loading: boolean }) => (
    <div data-testid="report-loading-area" data-loading={String(loading)}>
      {children}
    </div>
  ),
}));

vi.mock('@/core/theme/confirmation', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/core/theme/modal', () => ({
  __esModule: true,
  default: ({ className, overlayClassName }: { className?: string; overlayClassName?: string }) => (
    <div className={className} data-overlay-class-name={overlayClassName} data-testid="report-edit-modal" />
  ),
}));

vi.mock('@/modules/workingTime/Calendar/UnitForm', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('../workUnitOverride/ReportWorkUnitEditForm', () => ({
  default: ({ onClose, unit }: { onClose: () => void; unit: { id: string } }) => (
    <section aria-label="Report editor">
      <span>{unit.id}</span>
      <button onClick={onClose}>Close editor</button>
    </section>
  ),
}));

vi.mock('./reportTableRow', () => ({
  __esModule: true,
  default: ({ onEdit, unit }: { onEdit: () => void; unit: { id: string } }) => (
    <tr data-testid={`report-row-${unit.id}`}>
      <td>
        <button onClick={onEdit}>Edit {unit.id}</button>
      </td>
    </tr>
  ),
}));

const useReportExportMutationMock = useReportExportMutation as MockedFunction<typeof useReportExportMutation>;

interface WorkspaceMock {
  closeArchiveUnitConfirmation: Mock;
  closeEditUnitModal: Mock;
  handleArchiveSelectedUnit: Mock;
  handleDeleteConfirmationCancel: Mock;
  handleReportedUnitEditFormOpen: Mock;
  isArchiveReportedUnitConfirmOpen: boolean;
  isArchiveUnitConfirmOpen: boolean;
  loadingReportedUnits: boolean;
  loadingUnits: boolean;
  modalConfig: { isOpen: boolean };
  openArchiveUnitConfirmation: Mock;
  selectedUnit: ReportedUnit | undefined;
}

const createWorkspace = (loadingReportedUnits: boolean, loadingUnits: boolean): WorkspaceMock => {
  const ws = {
    closeArchiveUnitConfirmation: vi.fn(),
    closeEditUnitModal: vi.fn(),
    handleArchiveSelectedUnit: vi.fn(),
    handleDeleteConfirmationCancel: vi.fn(),
    handleReportedUnitEditFormOpen: vi.fn(),
    isArchiveReportedUnitConfirmOpen: false,
    isArchiveUnitConfirmOpen: false,
    loadingReportedUnits,
    loadingUnits,
    modalConfig: { isOpen: false } as { isOpen: boolean },
    openArchiveUnitConfirmation: vi.fn(),
    selectedUnit: undefined as ReportedUnit | undefined,
  };
  ws.handleReportedUnitEditFormOpen = vi.fn((unit: ReportedUnit) => {
    ws.selectedUnit = unit;
    ws.modalConfig.isOpen = true;
  });
  return ws;
};

const createTestState = (loadingReportedUnits: boolean, loadingUnits: boolean): void => {
  workspace = createWorkspace(loadingReportedUnits, loadingUnits);
  organizationSlug = 'acme';
};

const buildReportedUnit = (id: string): ReportedUnit =>
  ({ id, formattedReportDuration: '01:30' }) as unknown as ReportedUnit;

describe('ReportBoard loader ownership', () => {
  const filters = buildFilters();

  beforeEach(() => {
    addToastMock.mockClear();
    translationI18n.resolvedLanguage = 'en';
    useReportExportMutationMock.mockReturnValue({
      isPending: false,
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useReportExportMutation>);
  });

  it('does not reopen global stale modal state after report remount', () => {
    createTestState(false, false);
    const filteredReportedUnits = [buildReportedUnit('unit-1')];
    workspace.selectedUnit = filteredReportedUnits[0];
    workspace.modalConfig.isOpen = true;
    render(
      <ReportBoard
        filters={filters}
        filteredReportedUnits={filteredReportedUnits}
        filteredUnitsDurationSum="00:00"
        isNotLoadingAndHasNoFilteredUnits={false}
        loadingReportedUnits={false}
      />,
    );
    expect(screen.queryByLabelText('Report editor')).not.toBeInTheDocument();
  });

  it.each([
    {
      expectedLoading: true,
      loadingReportedUnits: true,
      loadingUnits: false,
      scenario: 'the report request is loading',
    },
    {
      expectedLoading: false,
      loadingReportedUnits: false,
      loadingUnits: true,
      scenario: 'only the weekly request is loading',
    },
  ])('renders loading=$expectedLoading when $scenario', ({ expectedLoading, loadingReportedUnits, loadingUnits }) => {
    createTestState(loadingReportedUnits, loadingUnits);

    render(
      <ReportBoard
        filters={filters}
        filteredReportedUnits={[]}
        filteredUnitsDurationSum="00:00"
        isNotLoadingAndHasNoFilteredUnits={false}
        loadingReportedUnits={loadingReportedUnits}
      />,
    );

    expect(screen.getByTestId('report-loading-area')).toHaveAttribute('data-loading', String(expectedLoading));
  });

  it('lists worklog columns without an entry type and shows the total under the Hours label', () => {
    createTestState(false, false);

    render(
      <ReportBoard
        filters={filters}
        filteredReportedUnits={[buildReportedUnit('unit-1')]}
        filteredUnitsDurationSum="12:30"
        isNotLoadingAndHasNoFilteredUnits={false}
        loadingReportedUnits={false}
      />,
    );

    expect(screen.queryByRole('columnheader', { name: 'common.type' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^common\.hours\s*12:30$/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'report.report_board.select_all_entries' })).not.toBeChecked();
  });

  it('sums the selected entries in the selection bar and clears the selection from it', async () => {
    const user = userEvent.setup();
    createTestState(false, false);

    render(
      <ReportBoard
        filters={filters}
        filteredReportedUnits={[buildReportedUnit('unit-1'), buildReportedUnit('unit-2')]}
        filteredUnitsDurationSum="03:00"
        isNotLoadingAndHasNoFilteredUnits={false}
        loadingReportedUnits={false}
      />,
    );
    const selectAll = screen.getByRole('checkbox', { name: 'report.report_board.select_all_entries' });

    await user.click(selectAll);
    expect(selectAll).toBeChecked();
    expect(screen.getByText('report.report_board.text.select_items · 03:00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'report.report_board.button.reset_selection.label' }));
    expect(selectAll).not.toBeChecked();
  });

  it('dims the previous rows and marks the table busy while a new report loads', () => {
    createTestState(false, false);

    render(
      <ReportBoard
        filters={filters}
        filteredReportedUnits={[buildReportedUnit('unit-1')]}
        filteredUnitsDurationSum="01:30"
        isNotLoadingAndHasNoFilteredUnits={false}
        loadingReportedUnits={false}
        refreshing
      />,
    );

    expect(screen.getByTestId('report-results')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('report-row-unit-1')).toBeInTheDocument();
  });

  it('opens the single editor from the pencil and keeps its selected worklog after report filtering', async () => {
    const user = userEvent.setup();
    createTestState(false, false);
    const closeBeforeWorkspaceUpdate = workspace.closeEditUnitModal;
    const view = render(
      <ReportBoard
        filters={filters}
        filteredReportedUnits={[buildReportedUnit('unit-1')]}
        filteredUnitsDurationSum="00:00"
        isNotLoadingAndHasNoFilteredUnits={false}
        loadingReportedUnits={false}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Edit unit-1' }));
    expect(screen.getByLabelText('Report editor')).toHaveTextContent('unit-1');
    const closeAfterWorkspaceUpdate = vi.fn();
    workspace.closeEditUnitModal = closeAfterWorkspaceUpdate;
    view.rerender(
      <ReportBoard
        filters={filters}
        filteredReportedUnits={[buildReportedUnit('unit-1')]}
        filteredUnitsDurationSum="00:00"
        isNotLoadingAndHasNoFilteredUnits={false}
        loadingReportedUnits={false}
      />,
    );
    expect(screen.getByLabelText('Report editor')).toHaveTextContent('unit-1');
    expect(closeAfterWorkspaceUpdate).not.toHaveBeenCalled();
    expect(closeBeforeWorkspaceUpdate).not.toHaveBeenCalled();
    view.rerender(
      <ReportBoard
        filters={filters}
        filteredReportedUnits={[]}
        filteredUnitsDurationSum="00:00"
        isNotLoadingAndHasNoFilteredUnits={false}
        loadingReportedUnits={false}
      />,
    );
    expect(screen.getByLabelText('Report editor')).toHaveTextContent('unit-1');
    await user.click(screen.getByRole('button', { name: 'Close editor' }));
    expect(screen.queryByLabelText('Report editor')).not.toBeInTheDocument();
    expect(workspace.closeEditUnitModal).toHaveBeenCalledOnce();
  });

  it('does not reuse the selected worklog in another organization', async () => {
    const user = userEvent.setup();
    createTestState(false, false);
    const view = render(
      <ReportBoard
        filters={filters}
        filteredReportedUnits={[buildReportedUnit('unit-1')]}
        filteredUnitsDurationSum="00:00"
        isNotLoadingAndHasNoFilteredUnits={false}
        loadingReportedUnits={false}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Edit unit-1' }));
    organizationSlug = 'other';
    view.rerender(
      <ReportBoard
        filters={filters}
        filteredReportedUnits={[buildReportedUnit('unit-1')]}
        filteredUnitsDurationSum="00:00"
        isNotLoadingAndHasNoFilteredUnits={false}
        loadingReportedUnits={false}
      />,
    );
    expect(screen.queryByLabelText('Report editor')).not.toBeInTheDocument();
  });

  it.each([
    ['XLS', 'xlsx'],
    ['CSV', 'csv'],
  ])('delegates %s export with selected rows and a click-time report context', async (buttonName, format) => {
    const user = userEvent.setup();
    createTestState(false, false);
    const mutate = vi.fn<(input: ExportReportInput) => void>();
    useReportExportMutationMock.mockReturnValue({
      isPending: false,
      mutate,
    } as unknown as ReturnType<typeof useReportExportMutation>);
    const exportFilters = buildFilters({
      selectedFromDate: dayjs('2026-07-01'),
      selectedToDate: dayjs('2026-07-31'),
      selectedUsers: { 'user-1': 'User' },
      selectedProjects: { 'project-1': 'Project' },
      selectedClients: { 'client-1': 'Client' },
    });

    render(
      <ReportBoard
        filters={exportFilters}
        filteredReportedUnits={[buildReportedUnit('unit-1')]}
        filteredUnitsDurationSum="00:00"
        isNotLoadingAndHasNoFilteredUnits={false}
        loadingReportedUnits={false}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: 'report.report_board.select_all_entries' }));
    expect(screen.getByTestId('report-export-actions')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: `report.report_board.button.${buttonName.toLowerCase()}.label` }),
    );

    exportFilters.selectedUsers['user-2'] = 'Changed after click';
    exportFilters.selectedProjects['project-2'] = 'Changed after click';
    exportFilters.selectedClients['client-2'] = 'Changed after click';
    await user.click(screen.getByRole('checkbox', { name: 'report.report_board.select_all_entries' }));

    expect(mutate).toHaveBeenCalledWith({
      format,
      organizationSlug: 'acme',
      selectedUnitIds: ['unit-1'],
      selectedFromDate: exportFilters.selectedFromDate,
      selectedToDate: exportFilters.selectedToDate,
    });
  });

  it('shows an export error without starting a mutation for an invalid range', async () => {
    const user = userEvent.setup();
    createTestState(false, false);
    const mutate = vi.fn<(input: ExportReportInput) => void>();
    useReportExportMutationMock.mockReturnValue({ isPending: false, mutate } as unknown as ReturnType<
      typeof useReportExportMutation
    >);
    render(
      <ReportBoard
        filters={buildFilters({ selectedFromDate: dayjs('2026-07-31'), selectedToDate: dayjs('2026-07-01') })}
        filteredReportedUnits={[buildReportedUnit('unit-1')]}
        filteredUnitsDurationSum="00:00"
        isNotLoadingAndHasNoFilteredUnits={false}
        loadingReportedUnits={false}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'report.report_board.select_all_entries' }));
    await user.click(screen.getByRole('button', { name: 'report.report_board.button.csv.label' }));

    expect(mutate).not.toHaveBeenCalled();
    expect(addToastMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });
});
