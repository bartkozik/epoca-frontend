import { useSortURLParams, type UseSortURLParamsReturn } from '@/core/utils/hooks';
import { SortColumn, SortDirection } from '@/core/utils/sorting';

const SORT_COLUMN_PARAM = 'membersSortColumn';
const SORT_DIRECTION_PARAM = 'membersSortDirection';

// Both columns are valid here (unlike useAssignedProjectsSortURLParams' single-column table), so
// validColumns lists both instead of pinning one.
const VALID_COLUMNS = [SortColumn.UserName, SortColumn.UserRole];
const DEFAULT_COLUMN = SortColumn.UserName;

export type UseMembersSortURLParamsReturn = UseSortURLParamsReturn;

export const useMembersSortURLParams = (): UseMembersSortURLParamsReturn =>
  useSortURLParams({
    sortColumnParam: SORT_COLUMN_PARAM,
    sortDirectionParam: SORT_DIRECTION_PARAM,
    validColumns: VALID_COLUMNS,
    defaultColumn: DEFAULT_COLUMN,
    defaultDirection: SortDirection.Desc,
  });
