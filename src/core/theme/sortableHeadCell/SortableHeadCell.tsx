import Icon, { icons } from '@/core/theme/icon';
import { convertCamelOrKebabCaseToSnakeCase } from '@/core/utils/helpers/convert-camel-or-kebab-case-to-snake-case';
import { SortColumn, SortDirection } from '@/core/utils/sorting';
import React from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import styles from './SortableHeadCell.module.scss';

interface TriangleIconProps {
  className: string;
}

const TriangleIcon = ({ className }: TriangleIconProps): JSX.Element => (
  <Icon width={8} height={4} icon={icons.triangle} className={className} />
);

interface SortableHeadCellProps<T> {
  column: T;
  icon?: React.ReactNode;
  sortColumn: T;
  sortDirection: SortDirection;
  updateSort: (column: T) => void;
}

const SortableHeadCell = <T extends SortColumn>({
  column,
  icon,
  sortColumn,
  sortDirection,
  updateSort,
}: SortableHeadCellProps<T>): JSX.Element => {
  const { t } = useTranslation();
  const isCurrentColumn = sortColumn === column;
  const isFlipped = sortDirection === SortDirection.Asc;

  const renderArrows = (): JSX.Element =>
    isCurrentColumn ? (
      <TriangleIcon className={clsx(styles.triangle, { [styles.flipped]: isFlipped })} />
    ) : (
      <>
        <TriangleIcon className={clsx(styles.triangle, styles.flipped)} />
        <TriangleIcon className={styles.triangle} />
      </>
    );

  return (
    <th scope="col" className={styles.root} data-th={column} onClick={() => updateSort(column)}>
      <div className={styles.header}>
        {t(`common.${convertCamelOrKebabCaseToSnakeCase(column)}`)}
        <div className={styles.icon}>{icon}</div>
        <div className={styles.triangleContainer}>{renderArrows()}</div>
      </div>
    </th>
  );
};

export default SortableHeadCell;
