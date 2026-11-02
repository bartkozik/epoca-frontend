import { useSortURLParams, type UseSortURLParamsReturn } from '@/core/utils/hooks';
import { SortColumn, SortDirection } from '@/core/utils/sorting';

// Prefixed so this table's sort can't collide with useProjectsURLParams' bare sortColumn/
// sortDirection on the parent /projects list page.
const SORT_COLUMN_PARAM = 'assignedMembersSortColumn';
const SORT_DIRECTION_PARAM = 'assignedMembersSortDirection';

// The only two columns AssignedMemberTable renders as sortable -- keeps a stray/stale URL value
// from selecting a column it has no comparator for.
const VALID_SORT_COLUMNS: SortColumn[] = [SortColumn.UserName, SortColumn.UserRole];

export type UseAssignedMembersSortURLParamsReturn = UseSortURLParamsReturn;

// ProjectDetails' onTabClick navigates to a bare path (no search forwarding), so switching away
// from the "assigned members" tab already drops these params -- same reset as before, just via
// navigation instead of an unmount effect.
export const useAssignedMembersSortURLParams = (): UseAssignedMembersSortURLParamsReturn =>
  useSortURLParams({
    sortColumnParam: SORT_COLUMN_PARAM,
    sortDirectionParam: SORT_DIRECTION_PARAM,
    validColumns: VALID_SORT_COLUMNS,
    defaultColumn: SortColumn.UserName,
    defaultDirection: SortDirection.Desc,
    forwardLocationState: true,
  });
