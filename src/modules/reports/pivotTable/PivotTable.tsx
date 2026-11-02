import Button from '@/core/theme/button';
import Icon, { icons } from '@/core/theme/icon';
import LoadingArea from '@/core/theme/loadingArea';
import MainContent from '@/core/theme/mainContent';
import PageHeader from '@/core/theme/pageHeader';
import ScrolledContainer from '@/core/theme/scrolledContainer';
import Snackbar from '@/core/theme/snackbar';
import { useTitle } from '@/core/utils/hooks';
import { useClients } from '@/modules/clients/ClientsProvider';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import ReportExportActions from '@/modules/reports/exportActions';
import FilterPanel from '@/modules/reports/filterPanel/FilterPanel';
import type { ReportQuerySnapshot } from '@/modules/reports/filterPanel/types';
import { useReportFilters } from '@/modules/reports/filterPanel/useReportFilters';
import { usePivotExportMutation } from '@/modules/reports/hooks/usePivotExportMutation';
import type { PivotErrorKind } from '@/modules/reports/hooks/usePivotTableQuery';
import { usePivotTableQuery } from '@/modules/reports/hooks/usePivotTableQuery';
import { useReportUsers } from '@/modules/reports/hooks/useReportUsers';
import ReportsTabs from '@/modules/reports/reportsTabs/ReportsTabs';
import { ReportsViewTabs, SpreadsheetFormat } from '@/modules/reports/types';
import { useReportDataFetch } from '@/modules/reports/useReportDataFetch';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { PivotKey } from './constants';
import PivotMatrix from './matrix';
import PivotConfigurationModal from './pivotConfiguration';
import { buildPivotExportPresentation } from './pivotExport';
import PivotFilterPopover from './pivotFilter';
import { createPivotLabelResolver } from './pivotLabels';
import styles from './PivotTable.module.scss';
import PivotShapeSelect, { usePivotShapeURL } from './shapes';
import { usePivotTableView } from './usePivotTableView';

const PIVOT_EXPORT_OPTIONS_ID = 'pivot-export-options';

const ERROR_MESSAGE_BY_KIND: Record<PivotErrorKind, string> = {
  contract: 'pivot_table.state.contract_error',
  forbidden: 'pivot_table.state.forbidden',
  generic: 'pivot_table.state.error',
  invalidConfiguration: 'pivot_table.state.invalid_configuration',
  resultTooLarge: 'pivot_table.state.result_too_large',
};

function PivotTable(): JSX.Element {
  const { t, i18n } = useTranslation();
  const [isConfigurationModalOpen, setIsConfigurationModalOpen] = useState(false);
  const [isExportBarOpen, setIsExportBarOpen] = useState(false);
  // A count, not a boolean: each filter field renders its own independent PivotFilterPopover,
  // so a single instance closing must not clear this while a sibling one is still open.
  const [openFilterCount, setOpenFilterCount] = useState(0);
  const [latestFilters, setLatestFilters] = useState<ReportQuerySnapshot | null>(null);
  const exportTriggerRef = useRef<HTMLButtonElement>(null);
  const verticalScrollContainerRef = useRef<HTMLDivElement>(null);
  const projectsContext = useProjects();

  const { clients } = useClients();
  const filters = useReportFilters();
  const view = usePivotTableView();
  const { layout, applyFilter, setOption } = view;
  const { moveField, shapeOptions, selectedShapeURL, selectShape } = usePivotShapeURL(view);
  const { response, exportSnapshot, errorKind, isInitialLoading, isRefreshing, retry } = usePivotTableQuery(
    layout,
    latestFilters,
  );
  const csvExportMutation = usePivotExportMutation(SpreadsheetFormat.CSV);
  const xlsxExportMutation = usePivotExportMutation(SpreadsheetFormat.XLS);
  const { isLoadingData } = useReportDataFetch();

  useTitle(t('common.pivotTable'));

  const handleApplyFilters = useCallback((snapshot: ReportQuerySnapshot): void => {
    setLatestFilters(snapshot);
  }, []);

  const reportUsers = useReportUsers();
  const resolveLabel = useMemo(
    () =>
      createPivotLabelResolver({
        clients,
        locale: i18n.language,
        projects: projectsContext.reportedProjects,
        t,
        users: reportUsers,
      }),
    [clients, reportUsers, i18n.language, projectsContext.reportedProjects, t],
  );

  const exportPresentation = useMemo(
    () =>
      exportSnapshot
        ? buildPivotExportPresentation({
            memberIdentities: exportSnapshot.memberIdentities,
            query: exportSnapshot.query,
            resolveLabel,
            t,
          })
        : null,
    [exportSnapshot, resolveLabel, t],
  );
  const hasExportableResult = Boolean(response && response.cells.length > 0 && exportSnapshot && exportPresentation);
  const closeExportBarAndRestoreFocus = useCallback((): void => {
    setIsExportBarOpen(false);
    exportTriggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!hasExportableResult) setIsExportBarOpen(false);
  }, [hasExportableResult]);

  useEffect(() => {
    if (!isExportBarOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      closeExportBarAndRestoreFocus();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [closeExportBarAndRestoreFocus, isExportBarOpen]);

  const renderFilterControl = useCallback(
    (key: PivotKey): JSX.Element | null => {
      const filter = layout.filters.find((candidate) => candidate.key === key);
      if (!filter) return null;
      const members = response?.filterMembers.find((group) => group.key === key)?.members ?? [];
      return (
        <PivotFilterPopover
          filter={filter}
          members={members}
          onApply={(includedValues) => applyFilter(key, includedValues)}
          onOpenChange={(isOpen) => setOpenFilterCount((count) => count + (isOpen ? 1 : -1))}
          resolveLabel={(value) => resolveLabel(key, value)}
        />
      );
    },
    [applyFilter, layout.filters, resolveLabel, response?.filterMembers],
  );

  const handleExport = (format: SpreadsheetFormat): void => {
    if (!exportSnapshot || !exportPresentation || isRefreshing) return;
    const mutation = format === SpreadsheetFormat.XLS ? xlsxExportMutation : csvExportMutation;
    if (mutation.isPending) return;
    mutation.mutate({ snapshot: exportSnapshot, presentation: exportPresentation });
  };

  const errorMessage = errorKind ? t(ERROR_MESSAGE_BY_KIND[errorKind]) : null;
  const error = errorMessage ? (
    <div className={styles.errorBanner} role="alert">
      <span>{errorMessage}</span>
      <Button label={t('pivot_table.state.retry')} onClick={() => retry()} size="small" variant="outlined" />
    </div>
  ) : null;

  return (
    <>
      <ScrolledContainer ref={verticalScrollContainerRef}>
        <MainContent>
          <LoadingArea loading={isLoadingData}>
            <PageHeader className={styles.header} title={t('common.reports')}>
              <ReportsTabs selectedTab={ReportsViewTabs.pivotTable}>
                <PivotShapeSelect onSelect={selectShape} options={shapeOptions} selectedURL={selectedShapeURL} />
              </ReportsTabs>
            </PageHeader>
            <FilterPanel filters={filters} onApplyFilters={handleApplyFilters} />
            <div className={styles.content}>
              <PivotConfigurationModal
                isFilterPanelOpen={openFilterCount > 0}
                isOpen={isConfigurationModalOpen}
                layout={layout}
                onClose={() => setIsConfigurationModalOpen(false)}
                onMove={moveField}
                onOptionChange={setOption}
                renderFilterControl={renderFilterControl}
              />
              <section
                aria-label={t('pivot_table.table.results')}
                className={clsx(styles.results, {
                  [styles.resultsWithExportBar]: isExportBarOpen && hasExportableResult,
                })}
              >
                {response && error}
                <div className={styles.resultToolbar} data-testid="pivot-result-toolbar">
                  <div
                    aria-atomic="true"
                    aria-label={isRefreshing ? t('pivot_table.state.refreshing') : undefined}
                    aria-live="polite"
                    className={styles.refreshStatusSlot}
                    role="status"
                  >
                    {isRefreshing && <span className={styles.refreshing}>{t('pivot_table.state.refreshing')}</span>}
                  </div>
                  <div className={styles.resultActions} data-testid="pivot-result-actions">
                    <button
                      aria-haspopup="dialog"
                      className={styles.configurationTrigger}
                      onClick={() => setIsConfigurationModalOpen(true)}
                      type="button"
                    >
                      {t('pivot_table.configurator.open')}
                    </button>
                    {hasExportableResult && exportPresentation && (
                      <button
                        aria-controls={PIVOT_EXPORT_OPTIONS_ID}
                        aria-expanded={isExportBarOpen}
                        className={styles.exportTrigger}
                        disabled={isRefreshing}
                        onClick={() => setIsExportBarOpen((open) => !open)}
                        ref={exportTriggerRef}
                        type="button"
                      >
                        {t('pivot_table.export.open')}
                      </button>
                    )}
                  </div>
                </div>
                {!response && isInitialLoading ? (
                  <div aria-label={t('pivot_table.state.loading')} className={styles.state} role="status">
                    {t('pivot_table.state.loading')}
                  </div>
                ) : !response ? (
                  error
                ) : response.cells.length === 0 ? (
                  <p className={styles.state}>{t('pivot_table.state.empty')}</p>
                ) : (
                  <PivotMatrix
                    locale={i18n.language}
                    projection={exportSnapshot?.projection}
                    request={exportSnapshot?.query ?? layout}
                    resolveLabel={resolveLabel}
                    response={response}
                    verticalScrollContainerRef={verticalScrollContainerRef}
                  />
                )}
                {hasExportableResult && exportPresentation && (
                  <Snackbar className={styles.exportSnackbar} isVisible={isExportBarOpen}>
                    <div
                      aria-label={t('pivot_table.export.options')}
                      className={styles.exportSnackbarContent}
                      id={PIVOT_EXPORT_OPTIONS_ID}
                      role="region"
                    >
                      <ReportExportActions
                        className={styles.exportSnackbarActions}
                        csvLoading={csvExportMutation.isPending}
                        disabled={isRefreshing}
                        onCsv={() => handleExport(SpreadsheetFormat.CSV)}
                        onXlsx={() => handleExport(SpreadsheetFormat.XLS)}
                        xlsxLoading={xlsxExportMutation.isPending}
                      />
                      <button
                        aria-label={t('pivot_table.export.close')}
                        className={styles.exportClose}
                        onClick={closeExportBarAndRestoreFocus}
                        type="button"
                      >
                        <Icon height={14} icon={icons.x} width={14} />
                      </button>
                    </div>
                  </Snackbar>
                )}
              </section>
            </div>
          </LoadingArea>
        </MainContent>
      </ScrolledContainer>
    </>
  );
}

export default PivotTable;
