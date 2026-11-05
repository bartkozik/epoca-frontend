import { isDemo } from '@/core/config/demo';
import Tooltip from '@/core/theme/tooltip';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { refreshReportedUnits } from '@/modules/reports/hooks/useReportedUnits';
import { isTerminalOverrideProblem } from '@/modules/reports/models/problem.model';
import type { WorkUnitOverride } from '@/modules/reports/models/workUnitOverride.model';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkUnitOverrideHistory } from './useWorkUnitOverrideHistory';
import styles from './WorkUnitOverrideForm.module.scss';
import { WorkUnitOverrideHistoryEvent } from './WorkUnitOverrideHistoryEvent';

interface Props {
  workUnitId: string;
  override?: WorkUnitOverride;
  revision?: number;
}

function BadgeSession({
  workUnitId,
  override,
  organizationSlug,
}: Props & { override: WorkUnitOverride; organizationSlug: string }): JSX.Element {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const allowed = override.permissions.canViewHistory && !revoked;
  const history = useWorkUnitOverrideHistory({
    isOpen: visible,
    autoLoadRetainedEntries: false,
    canViewHistory: allowed,
    hasHistory: override.hasHistory,
    currentVersion: override.version,
    workUnitId,
    organizationSlug,
    resetKey: 0,
    handleError: (error) => {
      if (!isTerminalOverrideProblem(error)) return false;
      setRevoked(true);
      void refreshReportedUnits().catch(() => undefined);
      return true;
    },
  });
  const latest = history.entries[0];
  const content =
    allowed && visible ? (
      latest ? (
        <WorkUnitOverrideHistoryEvent compact entry={latest} />
      ) : (
        <span>
          {t(
            history.loading
              ? 'reports.override.history.loading'
              : history.error
                ? 'reports.override.history.error'
                : history.hasMore
                  ? 'reports.override.history.previewLimited'
                  : 'reports.override.history.unavailable',
          )}
        </span>
      )
    ) : (
      <span>{t('reports.override.badge.generic')}</span>
    );
  return (
    <Tooltip content={content} onVisibilityChange={setVisible} fitViewport>
      <button type="button" className={styles.badge}>
        {t('reports.override.badge')}
      </button>
    </Tooltip>
  );
}

export default function WorkUnitOverrideBadge(props: Props): JSX.Element | null {
  const workspace = useWorkspace();
  if (isDemo || !props.override?.active) return null;
  const organizationSlug = workspace.contextOrganizationSlug;
  const sessionKey = JSON.stringify([
    organizationSlug,
    props.workUnitId,
    props.revision,
    props.override.version,
    props.override.hasHistory,
    props.override.permissions,
  ]);
  return <BadgeSession key={sessionKey} {...props} override={props.override} organizationSlug={organizationSlug} />;
}
