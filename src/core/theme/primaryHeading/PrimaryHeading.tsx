import { ReactNode } from 'react';
import clsx from 'clsx';
import styles from './PrimaryHeading.module.scss';

interface PrimaryHeadingProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

function PrimaryHeading({ children, className, id }: PrimaryHeadingProps): JSX.Element {
  return (
    <h2 className={clsx(styles.root, className)} id={id}>
      {children}
    </h2>
  );
}

export default PrimaryHeading;
