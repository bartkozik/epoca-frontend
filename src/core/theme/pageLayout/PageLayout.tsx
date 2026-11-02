import { ReactNode } from 'react';
import clsx from 'clsx';
import styles from './PageLayout.module.scss';

interface PageLayoutProps {
  avatar?: ReactNode;
  children?: ReactNode;
  className?: string;
  sectionName: string;
  title: string;
}

const PageLayout = ({ avatar, children, sectionName, title, className }: PageLayoutProps): JSX.Element => {
  return (
    <div className={clsx(styles.root, className)}>
      <div className={styles.nameBox}>
        <span className={styles.title}>{title}</span>
        <div className={styles.nameRow}>
          {avatar && <div className={styles.avatar}>{avatar}</div>}
          <h2 className={styles.name}>{sectionName}</h2>
        </div>
      </div>
      {children}
    </div>
  );
};

export default PageLayout;
