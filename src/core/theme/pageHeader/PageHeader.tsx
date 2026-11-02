import PrimaryHeading from '@/core/theme/primaryHeading';
import { ReactNode } from 'react';
import clsx from 'clsx';
import styles from './PageHeader.module.scss';

interface PageHeaderProps {
  title: string;
  children?: ReactNode;
  className?: string;
}

function PageHeader({ className, title, children }: PageHeaderProps): JSX.Element {
  return (
    <header className={clsx(styles.header, className)}>
      <PrimaryHeading>{title}</PrimaryHeading>
      {children}
    </header>
  );
}

export default PageHeader;
