import { SortColumn, SortDirection } from '@/core/utils/sorting';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

export interface UseSortURLParamsOptions {
  sortColumnParam: string;
  sortDirectionParam: string;
  validColumns: SortColumn[];
  defaultColumn: SortColumn;
  defaultDirection: SortDirection;
  // Some tables' `replace` navigate must forward the current router state (e.g. a details page's
  // GoBack link reading fromListSearch) instead of dropping it -- callers that don't need this
  // (the two full list-filter hooks) omit it.
  forwardLocationState?: boolean;
}

export interface UseSortURLParamsReturn {
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  updateSort: (column: SortColumn) => void;
}

// Shared sort-URL-param logic behind useClientsURLParams/useProjectsURLParams (full list filters)
// and useAssignedProjectsSortURLParams/useAssignedMembersSortURLParams (single-table sort only,
// which pass a one-element validColumns and ignore updateSort's column argument).
export const useSortURLParams = (options: UseSortURLParamsOptions): UseSortURLParamsReturn => {
  const { sortColumnParam, sortDirectionParam, validColumns, defaultColumn, defaultDirection, forwardLocationState } =
    options;

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const isSortColumn = (value: string): value is SortColumn => validColumns.includes(value as SortColumn);
  const isSortDirection = (value: string): value is SortDirection =>
    (Object.values(SortDirection) as string[]).includes(value);

  const columnValue = searchParams.get(sortColumnParam);
  const sortColumn = columnValue && isSortColumn(columnValue) ? columnValue : defaultColumn;

  const directionValue = searchParams.get(sortDirectionParam);
  const sortDirection = directionValue && isSortDirection(directionValue) ? directionValue : defaultDirection;

  const updateSort = (column: SortColumn): void => {
    const nextDirection = sortDirection === SortDirection.Asc ? SortDirection.Desc : SortDirection.Asc;
    const nextParams = new URLSearchParams(searchParams.toString());

    if (column !== defaultColumn) nextParams.set(sortColumnParam, column);
    else nextParams.delete(sortColumnParam);

    if (nextDirection !== defaultDirection) nextParams.set(sortDirectionParam, nextDirection);
    else nextParams.delete(sortDirectionParam);

    navigate(
      { search: nextParams.toString() },
      { replace: true, ...(forwardLocationState ? { state: location.state as unknown } : {}) },
    );
  };

  return { sortColumn, sortDirection, updateSort };
};
