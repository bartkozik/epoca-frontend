import Button from '@/core/theme/button';
import LoadingArea from '@/core/theme/loadingArea';
import MainContent from '@/core/theme/mainContent';
import PageHeader from '@/core/theme/pageHeader';
import ScrolledContainer from '@/core/theme/scrolledContainer';
import { useTitle } from '@/core/utils/hooks';
import { useReportedUnits } from '@/modules/reports/hooks/useReportedUnits';
import ReportsTabs from '@/modules/reports/reportsTabs/ReportsTabs';
import { ReportsViewTabs } from '@/modules/reports/types';
import { useReportDataFetch } from '@/modules/reports/useReportDataFetch';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import FilterPanel from '../filterPanel/FilterPanel';
import type { ReportQuerySnapshot } from '../filterPanel/types';
import { useReportFilters } from '../filterPanel/useReportFilters';
import styles from './Report.module.scss';
import ReportBoard from './reportBoard';
import { useFilteredReportedUnits } from './useFilteredReportedUnits';

const Report = (): JSX.Element => {
  const { t } = useTranslation();
  const {
    getReportedUnits,
    loadingReportedUnits,
    reportedUnits,
    reportedUnitsError,
    hasReportedUnitsData,
    isRefreshingReportedUnits,
  } = useReportedUnits();
  const filters = useReportFilters();
  const { isLoadingData } = useReportDataFetch();
  const { filteredReportedUnits, filteredUnitsDurationSum, isNotLoadingAndHasNoFilteredUnits } =
    useFilteredReportedUnits({
      reportedUnits,
      selectedClients: filters.selectedClients,
      selectedProjects: filters.selectedProjects,
      selectedUsers: filters.selectedUsers,
      isLoadingReportData: loadingReportedUnits,
    });

  const handleApplyFilters = useCallback(
    async (snapshot: ReportQuerySnapshot): Promise<void> => {
      await getReportedUnits(snapshot);
    },
    [getReportedUnits],
  );

  useTitle(t('common.reports'));

  return (
    <>
      <ScrolledContainer>
        <MainContent>
          <LoadingArea loading={isLoadingData}>
            <PageHeader title={t('common.reports')} className={styles.header}>
              <ReportsTabs selectedTab={ReportsViewTabs.report} />
            </PageHeader>
            <FilterPanel
              filters={filters}
              onApplyFilters={handleApplyFilters}
              summary={
                hasReportedUnitsData && (
                  <span className={styles.summary} aria-live="polite">
                    {isRefreshingReportedUnits && (
                      <span className={styles.updating}>{t('report.summary.updating')}</span>
                    )}
                    <span>{t('report.summary.entries', { count: filteredReportedUnits.length })}</span>
                  </span>
                )
              }
            />
            {reportedUnitsError && (
              <div className={styles.errorState} role="alert">
                <p>{t(hasReportedUnitsData ? 'report.error.refresh' : 'report.error.load')}</p>
                <Button type="button" label={t('common.retry')} onClick={() => void getReportedUnits()} />
              </div>
            )}
            {(!reportedUnitsError || hasReportedUnitsData) && (
              <ReportBoard
                filters={filters}
                filteredReportedUnits={filteredReportedUnits}
                filteredUnitsDurationSum={filteredUnitsDurationSum}
                isNotLoadingAndHasNoFilteredUnits={isNotLoadingAndHasNoFilteredUnits}
                loadingReportedUnits={loadingReportedUnits}
                refreshing={isRefreshingReportedUnits}
              />
            )}
          </LoadingArea>
        </MainContent>
      </ScrolledContainer>
    </>
  );
};

export default Report;
