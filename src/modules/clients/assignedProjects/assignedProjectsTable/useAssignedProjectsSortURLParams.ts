import { useSortURLParams, type UseSortURLParamsReturn } from '@/core/utils/hooks';
import { SortColumn, SortDirection } from '@/core/utils/sorting';

// Prefixed (unlike useClientsURLParams' bare 'sortDirection') so a future change that starts
// forwarding location.search into /clients (mirroring ClientDetails' onTabClick fix) can't
// accidentally have this table's direction bleed into ClientsBoard's, or vice versa.
const SORT_COLUMN_PARAM = 'assignedProjectsSortColumn';
const SORT_DIRECTION_PARAM = 'assignedProjectsSortDirection';

// This table only ever sorts by one column, so unlike useClientsURLParams there's no real column
// param to read/validate -- passing a one-element validColumns keeps sortColumn always this value.
const SORT_COLUMN = SortColumn.Project;

export type UseAssignedProjectsSortURLParamsReturn = UseSortURLParamsReturn;

// Persists this table's sort direction through the URL instead of local useState: Tabs
// (core/theme/tabs) unmounts inactive tab content entirely, so switching from "Assigned Projects"
// to "Client Details" and back used to reset the sort. The URL used is /clients/:clientId/:tab --
// ClientDetails' tab switch already navigates across that :tab segment, so it also has to preserve
// location.search for this to survive (see ClientDetails.tsx's onTabClick).
export const useAssignedProjectsSortURLParams = (): UseAssignedProjectsSortURLParamsReturn =>
  useSortURLParams({
    sortColumnParam: SORT_COLUMN_PARAM,
    sortDirectionParam: SORT_DIRECTION_PARAM,
    validColumns: [SORT_COLUMN],
    defaultColumn: SORT_COLUMN,
    defaultDirection: SortDirection.Desc,
    forwardLocationState: true,
  });
