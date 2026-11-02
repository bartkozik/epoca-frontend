import Spinner from '@/core/theme/spinner';
import type { ReactNode } from 'react';
import styles from './OverrideLoadingStatus.module.scss';

const OverrideLoadingStatus = ({ children }: { children: ReactNode }): JSX.Element => {
  return (
    <div role="status" aria-busy="true" className={styles.root}>
      <Spinner loading small className={styles.spinner} />
      <span>{children}</span>
    </div>
  );
};

export default OverrideLoadingStatus;
