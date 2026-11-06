import { useSortURLParams, type UseSortURLParamsReturn } from '@/core/utils/hooks';
import { SortColumn, SortDirection } from '@/core/utils/sorting';

const SORT_COLUMN_PARAM = 'assignedMembersSortColumn';
const SORT_DIRECTION_PARAM = 'assignedMembersSortDirection';

const VALID_SORT_COLUMNS: SortColumn[] = [SortColumn.UserName, SortColumn.UserRole];

export type UseAssignedMembersSortURLParamsReturn = UseSortURLParamsReturn;

export const useAssignedMembersSortURLParams = (): UseAssignedMembersSortURLParamsReturn =>
  useSortURLParams({
    sortColumnParam: SORT_COLUMN_PARAM,
    sortDirectionParam: SORT_DIRECTION_PARAM,
    validColumns: VALID_SORT_COLUMNS,
    defaultColumn: SortColumn.UserName,
    defaultDirection: SortDirection.Desc,
    forwardLocationState: true,
  });
