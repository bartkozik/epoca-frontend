import { useSortURLParams, type UseSortURLParamsReturn } from '@/core/utils/hooks';
import { SortColumn, SortDirection } from '@/core/utils/sorting';

const SORT_COLUMN_PARAM = 'assignedProjectsSortColumn';
const SORT_DIRECTION_PARAM = 'assignedProjectsSortDirection';

const SORT_COLUMN = SortColumn.Project;

export type UseAssignedProjectsSortURLParamsReturn = UseSortURLParamsReturn;

export const useAssignedProjectsSortURLParams = (): UseAssignedProjectsSortURLParamsReturn =>
  useSortURLParams({
    sortColumnParam: SORT_COLUMN_PARAM,
    sortDirectionParam: SORT_DIRECTION_PARAM,
    validColumns: [SORT_COLUMN],
    defaultColumn: SORT_COLUMN,
    defaultDirection: SortDirection.Desc,
    forwardLocationState: true,
  });
