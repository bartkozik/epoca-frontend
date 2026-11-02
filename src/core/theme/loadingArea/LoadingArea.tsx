import Spinner from '@/core/theme/spinner';
import React from 'react';
import clsx from 'clsx';
import styles from './LoadingArea.module.scss';

interface LoadingAreaProps {
  children?: React.ReactNode | React.ReactNode[];
  loading: boolean;
  className?: string;
  // Overrides the default Spinner with a caller-supplied loader element — keeps LoadingArea free
  // of any dependency on a specific module's loader visuals (see modules/workingTime's usage).
  loader?: React.ReactNode;
}

const LoadingArea = ({ children, className, loading, loader }: LoadingAreaProps): JSX.Element => {
  const loaderDisplay = loader ?? <Spinner className={styles.loader} loading={loading} />;

  return (
    <div className={clsx(styles.root, className)}>
      {loaderDisplay}
      <div className={styles.loadingArea}>{!loading && children}</div>
    </div>
  );
};

export default LoadingArea;
