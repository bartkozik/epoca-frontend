import { useDebounce, useSortURLParams } from '@/core/utils/hooks';
import { SortColumn, SortDirection } from '@/core/utils/sorting';
import { ClientFilterType, ClientStatus } from '@/modules/clients/types';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const QUERY_PARAM = 'q';
const STATUS_PARAM = 'status';
const TYPE_PARAM = 'type';
const SORT_COLUMN_PARAM = 'sortColumn';
const SORT_DIRECTION_PARAM = 'sortDirection';

const DEFAULT_STATUS = ClientStatus.Active;
const DEFAULT_FILTER_TYPE = ClientFilterType.All;
const DEFAULT_SORT_COLUMN = SortColumn.Client;
const DEFAULT_SORT_DIRECTION = SortDirection.Desc;

const VALID_SORT_COLUMNS: SortColumn[] = [SortColumn.Client, SortColumn.DateAdded];

// Debounce URL writes to avoid Safari history.replaceState rate limits.
const QUERY_URL_WRITE_DELAY_MS = 300;

const isClientStatus = (value: string): value is ClientStatus =>
  (Object.values(ClientStatus) as string[]).includes(value);

const isClientFilterType = (value: string): value is ClientFilterType =>
  (Object.values(ClientFilterType) as string[]).includes(value);

const parseStatus = (params: URLSearchParams): ClientStatus => {
  const value = params.get(STATUS_PARAM);
  return value && isClientStatus(value) ? value : DEFAULT_STATUS;
};

const parseFilterType = (params: URLSearchParams): ClientFilterType => {
  const value = params.get(TYPE_PARAM);
  return value && isClientFilterType(value) ? value : DEFAULT_FILTER_TYPE;
};

export interface UseClientsURLParamsReturn {
  query: string;
  selectedStatus: ClientStatus;
  selectedFilterType: ClientFilterType;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  setQuery: (query: string) => void;
  setSelectedStatus: (status: ClientStatus) => void;
  setSelectedFilterType: (filterType: ClientFilterType) => void;
  updateSort: (column: SortColumn) => void;
  resetFilters: () => void;
}

export const useClientsURLParams = (): UseClientsURLParamsReturn => {
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
  const selectedFilterType = parseFilterType(searchParams);

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

  const setSelectedStatus = (status: ClientStatus): void =>
    updateURL((params) => {
      if (status !== DEFAULT_STATUS) params.set(STATUS_PARAM, status);
      else params.delete(STATUS_PARAM);
    });

  const setSelectedFilterType = (filterType: ClientFilterType): void =>
    updateURL((params) => {
      if (filterType !== DEFAULT_FILTER_TYPE) params.set(TYPE_PARAM, filterType);
      else params.delete(TYPE_PARAM);
    });

  const resetFilters = (): void => {
    setQueryState('');
    updateURL((params) => {
      params.delete(QUERY_PARAM);
      params.delete(STATUS_PARAM);
      params.delete(TYPE_PARAM);
    });
  };

  return {
    query,
    selectedStatus,
    selectedFilterType,
    sortColumn,
    sortDirection,
    setQuery,
    setSelectedStatus,
    setSelectedFilterType,
    updateSort,
    resetFilters,
  };
};
