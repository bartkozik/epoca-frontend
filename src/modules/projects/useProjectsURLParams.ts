import { useDebounce, useSortURLParams } from '@/core/utils/hooks';
import { SortColumn, SortDirection } from '@/core/utils/sorting';
import { ProjectStatus } from '@/modules/projects/types';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const QUERY_PARAM = 'q';
const STATUS_PARAM = 'status';
const SORT_COLUMN_PARAM = 'sortColumn';
const SORT_DIRECTION_PARAM = 'sortDirection';

const DEFAULT_STATUS = ProjectStatus.Active;
const DEFAULT_SORT_COLUMN = SortColumn.DateAdded;
const DEFAULT_SORT_DIRECTION = SortDirection.Desc;

const VALID_SORT_COLUMNS: SortColumn[] = [
  SortColumn.Project,
  SortColumn.Client,
  SortColumn.Members,
  SortColumn.DateAdded,
];

// Debounce URL writes to avoid Safari history.replaceState rate limits.
const QUERY_URL_WRITE_DELAY_MS = 300;

const isProjectStatus = (value: string): value is ProjectStatus =>
  (Object.values(ProjectStatus) as string[]).includes(value);

const parseStatus = (params: URLSearchParams): ProjectStatus => {
  const value = params.get(STATUS_PARAM);
  return value && isProjectStatus(value) ? value : DEFAULT_STATUS;
};

export interface UseProjectsURLParamsReturn {
  query: string;
  selectedStatus: ProjectStatus;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  setQuery: (query: string) => void;
  setSelectedStatus: (status: ProjectStatus) => void;
  updateSort: (column: SortColumn) => void;
  resetFilters: () => void;
}

export const useProjectsURLParams = (): UseProjectsURLParamsReturn => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { sortColumn, sortDirection, updateSort } = useSortURLParams({
    sortColumnParam: SORT_COLUMN_PARAM,
    sortDirectionParam: SORT_DIRECTION_PARAM,
    validColumns: VALID_SORT_COLUMNS,
    defaultColumn: DEFAULT_SORT_COLUMN,
    defaultDirection: DEFAULT_SORT_DIRECTION,
  });

  const urlQuery = searchParams.get(QUERY_PARAM) ?? '';
  const selectedStatus = parseStatus(searchParams);

  const [query, setQueryState] = useState(urlQuery);
  const debouncedQuery = useDebounce(query, QUERY_URL_WRITE_DELAY_MS);

  const updateURL = (mutate: (params: URLSearchParams) => void): void => {
    const nextParams = new URLSearchParams(searchParams.toString());
    mutate(nextParams);
    navigate({ search: nextParams.toString() }, { replace: true });
  };

  useEffect(() => {
    setQueryState(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    if (debouncedQuery === urlQuery) return;
    updateURL((params) => {
      if (debouncedQuery) params.set(QUERY_PARAM, debouncedQuery);
      else params.delete(QUERY_PARAM);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only fire on the debounced value settling
  }, [debouncedQuery]);

  const setQuery = (newQuery: string): void => setQueryState(newQuery);

  const setSelectedStatus = (status: ProjectStatus): void =>
    updateURL((params) => {
      if (status !== DEFAULT_STATUS) params.set(STATUS_PARAM, status);
      else params.delete(STATUS_PARAM);
    });

  const resetFilters = (): void => {
    setQueryState('');
    updateURL((params) => {
      params.delete(QUERY_PARAM);
      params.delete(STATUS_PARAM);
    });
  };

  return {
    query,
    selectedStatus,
    sortColumn,
    sortDirection,
    setQuery,
    setSelectedStatus,
    updateSort,
    resetFilters,
  };
};
