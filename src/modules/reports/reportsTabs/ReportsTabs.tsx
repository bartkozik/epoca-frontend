import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import { useAuth } from '@/modules/auth/AuthProvider';
import { withoutPivotShape } from '@/modules/reports/pivotTable/layout/pivotShapeURL';
import { pivotTablePaths } from '@/modules/reports/pivotTable/routes';
import { reportPaths } from '@/modules/reports/report/routes';
import { ReportsViewTabs } from '@/modules/reports/types';
import { ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import styles from './ReportsTabs.module.scss';

interface ReportTabsProps {
  selectedTab: ReportsViewTabs;
  children?: ReactNode;
}

function ReportsTabs({ selectedTab, children }: ReportTabsProps): JSX.Element {
  const auth = useAuth();
  const { t } = useTranslation();
  const { search } = useLocation();
  const canViewPivotTable = auth.hasAccess(ROLE_PERMISSIONS.Manager);
  const reportSearch = useMemo(() => {
    const next = withoutPivotShape(new URLSearchParams(search)).toString();
    return next ? `?${next}` : '';
  }, [search]);

  return (
    <>
      <section className={styles.root}>
        <Link
          className={clsx(styles.link, { [styles.active]: selectedTab === ReportsViewTabs.report })}
          to={{ pathname: reportPaths.main, search: reportSearch }}
        >
          {t('common.report')}
        </Link>
        {canViewPivotTable && (
          <Link
            className={clsx(styles.link, { [styles.active]: selectedTab === ReportsViewTabs.pivotTable })}
            to={{ pathname: pivotTablePaths.main, search }}
          >
            {t('common.pivotTable')}
          </Link>
        )}
        {children}
      </section>
    </>
  );
}

export default ReportsTabs;
