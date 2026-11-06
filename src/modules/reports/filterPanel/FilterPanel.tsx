import { MultiSearchOptionMeta, SelectOption } from '@/core/theme/inputs';
import MultiSearch from '@/core/theme/multiSearch';
import FilterPanelTag from '@/modules/reports/filterPanel/filterPanelTag';
import { getReportedUnits } from '@/modules/reports/hooks/useReportedUnits';
import { useReportFilterFacets } from '@/modules/reports/hooks/useReportFilterFacets';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs, { Dayjs } from 'dayjs';
import DateRangePicker from './dateRangePicker';
import { formatFacetHours } from './filterFacets';
import styles from './FilterPanel.module.scss';
import {
  createReportDateRangeSnapshot,
  ReportDateRange,
  ReportDateRangeDirection,
  ReportDateRangeSnapshot,
  shiftReportDateRange,
} from './reportDateRange';
import { FilterCategory, ReportQuerySnapshot, SelectedItemsMap, UpdateSelectedOptionProps } from './types';
import { useFilterPanelURLParams } from './useFilterPanelURLParams';
import { useReportDateRangeURL } from './useReportDateRangeURL';
import type { ReportFilters } from './useReportFilters';

const FILTER_APPLY_DELAY_MS = 250;
const HOURS_PENDING = '––:––';
const HOURS_NONE = '—';

interface FilterPanelProps {
  filters: ReportFilters;
  onApplyFilters?: (snapshot: ReportQuerySnapshot) => void | Promise<void>;
  summary?: ReactNode;
}

interface PendingApply {
  snapshot: ReportDateRangeSnapshot;
  delayMs: number;
}

const toSelectedMap = (values: string[], options: SelectOption[]): SelectedItemsMap =>
  Object.fromEntries(values.map((value) => [value, options.find((option) => option.value === value)?.label ?? value]));

const summarizeSelection = (selected: SelectedItemsMap): string => {
  const labels = Object.values(selected);
  return labels.length === 1 ? labels[0] : `${labels[0]} +${labels.length - 1}`;
};

function FilterPanel({ filters, onApplyFilters, summary }: FilterPanelProps): JSX.Element {
  const { t } = useTranslation();
  const {
    areAllClientsSelected,
    areAllProjectsSelected,
    areAllUsersSelected,
    clientsSearchOptions,
    contextOrganizationUserSearchOptions,
    navigationMode,
    projectsSearchOptions,
    selectedClients,
    selectedFromDate,
    selectedProjects,
    selectedToDate,
    selectedUsers,
    setSelectedClients,
    setSelectedDateRange,
    setSelectedFilters,
    setSelectedProjects,
    setSelectedUsers,
  } = filters;
  const replaceDateRangeRef = useRef<(snapshot: ReportDateRangeSnapshot) => void>(() => undefined);

  const handleUpdateSelectedOptions = ({
    newSelectedClients,
    newSelectedProjects,
    newSelectedUsers,
  }: UpdateSelectedOptionProps): void => {
    setSelectedFilters({ clients: newSelectedClients, projects: newSelectedProjects, users: newSelectedUsers });
  };

  const { setURLParams } = useFilterPanelURLParams({
    clientsSearchOptions,
    projectsSearchOptions,
    contextOrganizationUserSearchOptions,
    handleUpdateSelectedOptions,
  });

  const createQuerySnapshot = useCallback(
    (dateRangeSnapshot: ReportDateRangeSnapshot): ReportQuerySnapshot => ({
      ...dateRangeSnapshot,
      projectIds: areAllProjectsSelected ? [] : Object.keys(selectedProjects),
      userIds: areAllUsersSelected ? [] : Object.keys(selectedUsers),
      clientIds: areAllClientsSelected ? [] : Object.keys(selectedClients),
    }),
    [
      areAllClientsSelected,
      areAllProjectsSelected,
      areAllUsersSelected,
      selectedClients,
      selectedProjects,
      selectedUsers,
    ],
  );

  const applyFilters = useCallback(
    (dateRangeSnapshot?: ReportDateRangeSnapshot): void => {
      const snapshot =
        dateRangeSnapshot ??
        ({
          fromDate: selectedFromDate,
          navigationMode,
          toDate: selectedToDate,
          today: dayjs().startOf('day'),
        } satisfies ReportDateRangeSnapshot);

      const querySnapshot = createQuerySnapshot(snapshot);
      if (onApplyFilters) void onApplyFilters(querySnapshot);
      else void getReportedUnits(querySnapshot);
    },
    [createQuerySnapshot, navigationMode, onApplyFilters, selectedFromDate, selectedToDate],
  );

  const commitDateRange = useCallback(
    (snapshot: ReportDateRangeSnapshot, updateURL = true): void => {
      setSelectedDateRange(snapshot);
      if (updateURL) replaceDateRangeRef.current(snapshot);
      applyFilters(snapshot);
    },
    [applyFilters, setSelectedDateRange],
  );

  const [pendingApply, setPendingApply] = useState<PendingApply | null>(null);

  const handleHydrateDateRange = useCallback(
    (snapshot: ReportDateRangeSnapshot): void => {
      setSelectedDateRange(snapshot);
      setPendingApply({ snapshot, delayMs: 0 });
    },
    [setSelectedDateRange],
  );

  useEffect(() => {
    if (!pendingApply) return undefined;
    const run = (): void => {
      applyFilters(pendingApply.snapshot);
      setPendingApply(null);
    };
    if (pendingApply.delayMs === 0) {
      run();
      return undefined;
    }
    const timer = window.setTimeout(run, pendingApply.delayMs);
    return () => window.clearTimeout(timer);
  }, [applyFilters, pendingApply]);

  const { replaceDateRange } = useReportDateRangeURL({ onHydrate: handleHydrateDateRange });
  replaceDateRangeRef.current = replaceDateRange;

  const handleNavigateDateRange = useCallback(
    (direction: ReportDateRangeDirection): void => {
      const today = dayjs().startOf('day');
      const snapshot = shiftReportDateRange(
        { fromDate: selectedFromDate, navigationMode, toDate: selectedToDate, today },
        direction,
      );
      if (snapshot) commitDateRange(snapshot);
    },
    [commitDateRange, navigationMode, selectedFromDate, selectedToDate],
  );

  const handleCommitDateRange = useCallback(
    (range: ReportDateRange, capturedToday: Dayjs): void => {
      const snapshot = createReportDateRangeSnapshot(range, capturedToday);
      if (snapshot) commitDateRange(snapshot);
    },
    [commitDateRange],
  );

  const scheduleFilterApply = (): void => {
    setPendingApply({
      snapshot: { fromDate: selectedFromDate, navigationMode, toDate: selectedToDate, today: dayjs().startOf('day') },
      delayMs: FILTER_APPLY_DELAY_MS,
    });
  };

  const categories: Record<
    FilterCategory,
    { options: SelectOption[]; selected: SelectedItemsMap; setSelected: (map: SelectedItemsMap) => void }
  > = {
    clients: { options: clientsSearchOptions, selected: selectedClients, setSelected: setSelectedClients },
    projects: { options: projectsSearchOptions, selected: selectedProjects, setSelected: setSelectedProjects },
    users: { options: contextOrganizationUserSearchOptions, selected: selectedUsers, setSelected: setSelectedUsers },
  };

  const handleFilterChange = (category: FilterCategory, values: string[]): void => {
    const { options, setSelected } = categories[category];
    setSelected(toSelectedMap(values, options));
    setURLParams({ [category]: values.length > 0 ? values.join(',') : null });
    scheduleFilterApply();
  };

  const clearAllFilters = (): void => {
    setSelectedFilters({ clients: {}, projects: {}, users: {} });
    setURLParams({ clients: null, projects: null, users: null });
    scheduleFilterApply();
  };

  const selectedClientIds = useMemo(() => Object.keys(selectedClients), [selectedClients]);
  const selectedProjectIds = useMemo(() => Object.keys(selectedProjects), [selectedProjects]);
  const selectedUserIds = useMemo(() => Object.keys(selectedUsers), [selectedUsers]);
  const selection = useMemo(
    () => ({ clientIds: selectedClientIds, projectIds: selectedProjectIds, userIds: selectedUserIds }),
    [selectedClientIds, selectedProjectIds, selectedUserIds],
  );
  const facets = useReportFilterFacets({ fromDate: selectedFromDate, toDate: selectedToDate, selection });

  const optionMetaFor = (
    options: SelectOption[],
    hours: Map<string, number> | undefined,
  ): Record<string, MultiSearchOptionMeta> | undefined => {
    if (facets.status === 'unavailable' || facets.status === 'error') return undefined;
    if (facets.status !== 'ready')
      return Object.fromEntries(options.map(({ value }) => [value, { trailing: HOURS_PENDING }]));
    return Object.fromEntries(
      options.map(({ value }) => {
        const seconds = hours?.get(value) ?? 0;
        return [value, { trailing: seconds > 0 ? formatFacetHours(seconds) : HOURS_NONE, inactive: seconds === 0 }];
      }),
    );
  };

  const metaStatus =
    facets.status === 'error' ? (
      <>
        <span>{t('report.filter_panel.hours_unavailable')}</span>
        <button type="button" className={styles.retry} onClick={facets.retry}>
          {t('common.retry')}
        </button>
      </>
    ) : undefined;

  const filterFields: {
    category: FilterCategory;
    name: string;
    label: string;
    allLabel: string;
    searchPlaceholder: string;
    hours: Map<string, number> | undefined;
  }[] = [
    {
      category: 'clients',
      name: 'client',
      label: t('common.client'),
      allLabel: t('report.filter_panel.all_clients'),
      searchPlaceholder: t('report.filter_panel.search_clients'),
      hours: facets.facets?.clients,
    },
    {
      category: 'projects',
      name: 'project',
      label: t('common.project'),
      allLabel: t('report.filter_panel.all_projects'),
      searchPlaceholder: t('report.filter_panel.search_projects'),
      hours: facets.facets?.projects,
    },
    {
      category: 'users',
      name: 'user',
      label: t('common.user'),
      allLabel: t('report.filter_panel.all_users'),
      searchPlaceholder: t('report.filter_panel.search_users'),
      hours: facets.facets?.users,
    },
  ];

  const chips = filterFields
    .filter(({ category }) => Object.keys(categories[category].selected).length > 0)
    .map(({ category, label }) => (
      <FilterPanelTag
        key={category}
        category={label}
        value={summarizeSelection(categories[category].selected)}
        removeLabel={t('report.filter_panel.remove_filter', { category: label.toLocaleLowerCase() })}
        onRemove={() => handleFilterChange(category, [])}
      />
    ));

  return (
    <div className={styles.root}>
      <div className={styles.filterRow}>
        <DateRangePicker
          onCommitDateRange={handleCommitDateRange}
          onNavigateDateRange={handleNavigateDateRange}
          selectedFromDate={selectedFromDate}
          selectedToDate={selectedToDate}
        />
        <div className={styles.entityFilters} data-testid="source-filter-controls">
          {filterFields.map(({ category, name, label, allLabel, searchPlaceholder, hours }, index) => (
            <MultiSearch
              key={category}
              className={styles.entityFilter}
              items={categories[category].options}
              value={Object.keys(categories[category].selected)}
              onChange={(values) => handleFilterChange(category, values)}
              label={`${label}:`}
              name={name}
              allLabel={allLabel}
              searchPlaceholder={searchPlaceholder}
              optionMeta={optionMetaFor(categories[category].options, hours)}
              inactiveGroupLabel={t('report.filter_panel.no_hours_group')}
              metaStatus={metaStatus}
              onOpen={facets.request}
              alignRight={index === filterFields.length - 1}
            />
          ))}
        </div>
      </div>
      {(chips.length > 0 || summary) && (
        <div className={styles.resultsBar}>
          <div className={styles.chips}>
            {chips}
            {chips.length >= 2 && (
              <button type="button" className={styles.clearAll} onClick={clearAllFilters}>
                {t('report.filter_panel.clear_all')}
              </button>
            )}
          </div>
          {summary && <div className={styles.summary}>{summary}</div>}
        </div>
      )}
    </div>
  );
}

export default FilterPanel;
