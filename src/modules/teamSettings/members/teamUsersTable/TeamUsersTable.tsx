import SortableHeadCell from '@/core/theme/sortableHeadCell';
import { SortColumn } from '@/core/utils/sorting';
import { sortOrganizationUsers } from '@/modules/organizations/modelOrganizationUser';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import styles from './TeamUsersTable.module.scss';
import { useMembersSortURLParams } from './useMembersSortURLParams';

const COLUMNS = [SortColumn.UserName, SortColumn.UserRole];

type TeamUsersTableProps<T> = {
  items: T[];
  getName: (item: T) => string;
  getRoles: (item: T) => readonly string[];
  children: (items: T[]) => ReactNode;
  ariaLabel?: string;
  actionsLabel?: string;
};

const TeamUsersTable = <T,>({
  items,
  getName,
  getRoles,
  children,
  ariaLabel,
  actionsLabel,
}: TeamUsersTableProps<T>): JSX.Element => {
  const { sortColumn, sortDirection, updateSort } = useMembersSortURLParams();
  const sortedItems = sortOrganizationUsers(
    items.map((item) => ({ item, fullName: getName(item), organizationRoles: getRoles(item) })),
    sortColumn,
    sortDirection,
  ).map(({ item }) => item);

  return (
    <table className={clsx('table', styles.tableCustom)} aria-label={ariaLabel}>
      <thead>
        <tr>
          {COLUMNS.map((column) => (
            <SortableHeadCell
              key={column}
              column={column}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              updateSort={updateSort}
            />
          ))}
          <th data-th="Action" scope="col" aria-label={actionsLabel} />
        </tr>
      </thead>
      <tbody>{children(sortedItems)}</tbody>
    </table>
  );
};

export default TeamUsersTable;
