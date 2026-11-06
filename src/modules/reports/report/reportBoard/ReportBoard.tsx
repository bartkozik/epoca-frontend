import { isDemo } from '@/core/config/demo';
import { useToast } from '@/core/providers/toastProvider';
import noReportsImage from '@/core/theme/assets/images/projectsComponentImages/multitasking.png';
import Button from '@/core/theme/button';
import Checkbox from '@/core/theme/checkbox';
import Confirmation, { ConfirmationAction } from '@/core/theme/confirmation';
import LoadingArea from '@/core/theme/loadingArea';
import NoDataFound from '@/core/theme/noDataFound';
import Snackbar from '@/core/theme/snackbar';
import { convertCamelOrKebabCaseToSnakeCase } from '@/core/utils/helpers/convert-camel-or-kebab-case-to-snake-case';
import useWindowSize from '@/core/utils/hooks/useWindowSize';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import ReportExportActions from '@/modules/reports/exportActions';
import { createReportDateRangeSnapshot } from '@/modules/reports/filterPanel/reportDateRange';
import { useReportExportMutation } from '@/modules/reports/hooks/useReportExportMutation';
import { showReportExportError } from '@/modules/reports/showReportExportError';
import { SpreadsheetFormat } from '@/modules/reports/types';
import { type ReportedUnit } from '@/modules/workingTime/types';
import { useUnitWorkspace } from '@/modules/workingTime/UnitWorkspaceProvider';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import dayjs from 'dayjs';
import type { ReportFilters } from '../../filterPanel/useReportFilters';
import ReportWorkUnitEditForm from '../workUnitOverride/ReportWorkUnitEditForm';
import styles from './ReportBoard.module.scss';
import ReportTableRow from './reportTableRow';

const COLUMNS = ['Date', 'Client', 'Project', 'User', 'Description of activity', 'Task ID', 'Hours'];

interface ReportBoardProps {
  filters: ReportFilters;
  filteredReportedUnits: ReportedUnit[];
  filteredUnitsDurationSum: string;
  isNotLoadingAndHasNoFilteredUnits: boolean;
  loadingReportedUnits: boolean;
  refreshing?: boolean;
}

const ReportBoard = ({
  filters,
  filteredReportedUnits,
  filteredUnitsDurationSum,
  isNotLoadingAndHasNoFilteredUnits,
  loadingReportedUnits,
  refreshing = false,
}: ReportBoardProps): JSX.Element => {
  const { t, i18n } = useTranslation();
  const [viewportWidth] = useWindowSize();
  const isWideLayout = viewportWidth >= 1200;
  const workspace = useWorkspace();
  const { addToast } = useToast();
  const [editSession, setEditSession] = useState<{ unit: ReportedUnit; organizationSlug: string } | null>(null);
  const editSessionRef = useRef(editSession);
  editSessionRef.current = editSession;
  const organizationSlug = workspace.contextOrganizationSlug;
  const { selectedFromDate, selectedToDate } = filters;
  const {
    closeArchiveUnitConfirmation,
    closeEditUnitModal,
    handleArchiveSelectedUnit,
    handleDeleteConfirmationCancel,
    handleReportedUnitEditFormOpen,
    isArchiveReportedUnitConfirmOpen,
    isArchiveUnitConfirmOpen,
    modalConfig,
    openArchiveUnitConfirmation,
  } = useUnitWorkspace();
  const closeEditUnitModalRef = useRef(closeEditUnitModal);
  closeEditUnitModalRef.current = closeEditUnitModal;

  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set());
  const csvExportMutation = useReportExportMutation();
  const xlsxExportMutation = useReportExportMutation();

  useEffect(() => {
    setSelectedUnits((current) => {
      const next = new Set(
        Array.from(current).filter((unitId) => filteredReportedUnits.some((unit) => unit.id === unitId)),
      );
      return next.size === current.size ? current : next;
    });
  }, [filteredReportedUnits]);

  const areAllUnitsSelected = filteredReportedUnits.length > 0 && selectedUnits.size === filteredReportedUnits.length;
  const resetSelectedUnits = (): void => setSelectedUnits(new Set());
  const toggleUnitSelection = (unitId: string): void => {
    setSelectedUnits((current) => {
      const next = new Set(current);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  };

  const closeEditor = (): void => {
    setEditSession(null);
    closeEditUnitModal();
  };
  useEffect(() => {
    if (editSession && editSession.organizationSlug !== organizationSlug) closeEditor();
  }, [editSession, organizationSlug]);
  useEffect(
    () => () => {
      if (editSessionRef.current) closeEditUnitModalRef.current();
    },
    [],
  );

  const handleCheckboxClick = (unitId: string): void => toggleUnitSelection(unitId);

  const handleSelectAll = (): void => {
    if (areAllUnitsSelected) setSelectedUnits(new Set());
    else setSelectedUnits(new Set(filteredReportedUnits.map((u) => u.id)));
  };

  const selectedItemsText = t('report.report_board.text.select_items', { count: selectedUnits.size });
  const selectedUnitsDurationSum = useMemo(() => {
    const minutes = filteredReportedUnits
      .filter((unit) => selectedUnits.has(unit.id))
      .reduce((sum, unit) => {
        const [hours = '0', mins = '0'] = unit.formattedReportDuration.split(':');
        return sum + Number(hours) * 60 + Number(mins);
      }, 0);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }, [filteredReportedUnits, selectedUnits]);
  const isPolishLanguage = i18n.language === 'pl';

  const handleExport = (format: SpreadsheetFormat): void => {
    const mutation = format === SpreadsheetFormat.CSV ? csvExportMutation : xlsxExportMutation;
    if (mutation.isPending) return;
    const snapshot = createReportDateRangeSnapshot({ fromDate: selectedFromDate, toDate: selectedToDate }, dayjs());
    if (!snapshot) {
      showReportExportError(new Error('Invalid report date range'), addToast);
      return;
    }
    mutation.mutate({
      format,
      organizationSlug,
      selectedUnitIds: Array.from(selectedUnits),
      selectedFromDate: snapshot.fromDate,
      selectedToDate: snapshot.toDate,
    });
  };

  const table = (
    <>
      <table className={clsx('table', styles.tableCustom, { [styles.tableCustomPl]: isPolishLanguage })}>
        { }
        {isWideLayout && (
          <colgroup>
            <col className={styles.colSelect} />
            <col className={styles.colDate} />
            <col className={styles.colClient} />
            <col className={styles.colProject} />
            <col className={styles.colUser} />
            <col />
            <col className={styles.colTask} />
            <col className={styles.colHours} />
            <col className={styles.colActions} />
          </colgroup>
        )}
        <thead>
          <tr>
            <th data-th="Export">
              <span className={styles.checkboxCell}>
                <Checkbox
                  ariaLabel={t('report.report_board.select_all_entries')}
                  className={styles.checkboxTH}
                  selected={areAllUnitsSelected}
                  onClick={handleSelectAll}
                  variant="square"
                />
              </span>
            </th>
            {COLUMNS.map((column, i) => {
              const columnLabel = t(`common.${convertCamelOrKebabCaseToSnakeCase(column)}`);
              if (column === 'Hours')
                return (
                  <th key={i} data-th={column} title={columnLabel}>
                    <span className={styles.hoursHeader}>
                      <span>{columnLabel}</span>
                      <span className={styles.hoursHeaderTotal}>{filteredUnitsDurationSum}</span>
                    </span>
                  </th>
                );
              const columnsDisplay =
                i !== 1 ? (
                  columnLabel
                ) : (
                  <div className={styles.totalTimeHeaderMobile}>
                    {columnLabel}
                    <p>{`${t('common.hours')}: ${filteredUnitsDurationSum}`}</p>
                  </div>
                );
              return (
                <th key={i} data-th={column} title={columnLabel}>
                  {columnsDisplay}
                </th>
              );
            })}
            <th data-th="Actions" aria-label={t('common.actions')} />
          </tr>
        </thead>
        <tbody>
          {filteredReportedUnits.map((u) => (
            <ReportTableRow
              key={u.id}
              unit={u}
              isSelected={selectedUnits.has(u.id)}
              onCheckboxClick={handleCheckboxClick}
              onEdit={() => {
                handleReportedUnitEditFormOpen(u);
                setEditSession({ unit: u, organizationSlug });
              }}
              onArchive={() => openArchiveUnitConfirmation(u)}
            />
          ))}
        </tbody>
      </table>

      <Snackbar isVisible={selectedUnits.size > 0} className={styles.selectionSnackbar}>
        <div className={styles.snackbarContent}>
          <div className={styles.selectContainer}>
            <span className={styles.selectedItemsCount}>
              {selectedItemsText}
              {' · '}
              {selectedUnitsDurationSum}
            </span>
            <Button
              className={styles.resetInSnackbar}
              label={t('report.report_board.button.reset_selection.label')}
              variant="text"
              onClick={resetSelectedUnits}
              size="small"
            />
          </div>
          {!isDemo && (
            <ReportExportActions
              label={t('report.report_board.text.export_selected')}
              csvLoading={csvExportMutation.isPending}
              disabled={false}
              onCsv={() => handleExport(SpreadsheetFormat.CSV)}
              onXlsx={() => handleExport(SpreadsheetFormat.XLS)}
              xlsxLoading={xlsxExportMutation.isPending}
            />
          )}
        </div>
      </Snackbar>
    </>
  );

  const noDataFound = isNotLoadingAndHasNoFilteredUnits ? (
    <NoDataFound withoutButton image={noReportsImage} label={t('report.report_board.text.no_reports_found')} />
  ) : null;

  const confirmationActions: ConfirmationAction[][] = [
    [{ text: t('common.archive'), action: handleArchiveSelectedUnit }],
    [{ text: t('common.delete'), action: handleArchiveSelectedUnit }],
  ];

  return (
    <div className={styles.root}>
      <LoadingArea loading={loadingReportedUnits}>
        <div
          className={clsx(styles.results, { [styles.refreshing]: refreshing })}
          aria-busy={refreshing}
          data-testid="report-results"
        >
          {filteredReportedUnits.length > 0 ? table : noDataFound}
        </div>
      </LoadingArea>

      <Confirmation
        actionType="archive"
        confirmActions={confirmationActions[0]}
        isOpen={isArchiveUnitConfirmOpen}
        onCancel={closeArchiveUnitConfirmation}
        text={t('report.report_board.confirmation.message.archive_report')}
      />

      <Confirmation
        actionType="delete"
        confirmActions={confirmationActions[1]}
        isOpen={isArchiveReportedUnitConfirmOpen}
        onCancel={handleDeleteConfirmationCancel}
        text={t('report.report_board.confirmation.message.delete_report')}
      />

      {modalConfig.isOpen && editSession?.organizationSlug === organizationSlug && (
        <ReportWorkUnitEditForm unit={editSession.unit} onClose={closeEditor} />
      )}
    </div>
  );
};

export default ReportBoard;
