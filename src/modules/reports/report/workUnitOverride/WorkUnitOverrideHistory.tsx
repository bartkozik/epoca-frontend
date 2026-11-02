import Button from '@/core/theme/button';
import {
  CurrentWorkUnitOverrideHistoryEntrySchema,
  type WorkUnitOverride,
  type WorkUnitOverrideHistoryEntry,
} from '@/modules/reports/models/workUnitOverride.model';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import OverrideLoadingStatus from './OverrideLoadingStatus';
import { useWorkUnitOverrideHistory, type OverrideHistoryOptions } from './useWorkUnitOverrideHistory';
import styles from './WorkUnitOverrideHistory.module.scss';
import { WorkUnitOverrideHistoryEvent } from './WorkUnitOverrideHistoryEvent';

interface Props extends OverrideHistoryOptions {
  undoCandidateId?: string | null;
  undoDisabled?: boolean;
  undoDisabledReason?: string | null;
  undoUnavailableReason?: NonNullable<WorkUnitOverride['undo']>['reason'];
  onUndo?: (entry: WorkUnitOverrideHistoryEntry) => void;
}

const WorkUnitOverrideHistory = (props: Props): JSX.Element | null => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<'active' | 'full'>('active');
  const contentId = useId();
  const isExpanded = expanded && props.hasHistory;
  const history = useWorkUnitOverrideHistory({ ...props, isOpen: props.isOpen && isExpanded });
  const hasAdditionalEvents = history.allEntries.length > history.entries.length;
  const effectiveView = hasAdditionalEvents ? view : 'active';
  const visibleEntries = effectiveView === 'active' ? history.entries : history.allEntries;
  const latestRetained = history.entries[0];
  const latestCurrent = latestRetained ? CurrentWorkUnitOverrideHistoryEntrySchema.safeParse(latestRetained) : null;
  const currentEntryId =
    latestCurrent?.success &&
    (latestCurrent.data.after.projectId !== null || latestCurrent.data.after.taskId.mode !== 'Inherit')
      ? latestCurrent.data.id
      : null;
  if (!props.canViewHistory || !props.isOpen) return null;
  return (
    <section className={styles.root}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={isExpanded}
        disabled={!props.hasHistory}
        aria-controls={contentId}
        onClick={() => setExpanded((value) => !value)}
      >
        {t('reports.override.history.heading')}
        <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
      </button>
      {isExpanded && (
        <div id={contentId} role="region" aria-label={t('reports.override.history.heading')} className={styles.region}>
          <div className={styles.viewSwitch} role="group" aria-label={t('reports.override.history.view')}>
            <button
              type="button"
              className={styles.viewButton}
              aria-pressed={effectiveView === 'active'}
              onClick={() => setView('active')}
            >
              {t('reports.override.history.active')}
            </button>
            <button
              type="button"
              className={styles.viewButton}
              aria-pressed={effectiveView === 'full'}
              disabled={!hasAdditionalEvents}
              onClick={() => setView('full')}
            >
              {t('reports.override.history.full')}
            </button>
          </div>
          <div className={styles.content} role="group" aria-label={t('reports.override.history.entries')}>
            <ol className={styles.list}>
              {visibleEntries.map((entry) => {
                const current = CurrentWorkUnitOverrideHistoryEntrySchema.safeParse(entry);
                const canUndoEntry =
                  current.success &&
                  current.data.id === props.undoCandidateId &&
                  (current.data.operation === 'Replace' || current.data.operation === 'Clear') &&
                  current.data.revertedBy == null;
                return (
                  <li key={entry.id}>
                    <WorkUnitOverrideHistoryEvent
                      entry={entry}
                      isCurrent={entry.id === currentEntryId}
                      undoDisabled={props.undoDisabled}
                      onUndo={canUndoEntry ? props.onUndo : undefined}
                    />
                  </li>
                );
              })}
            </ol>
            {history.loading && <OverrideLoadingStatus>{t('reports.override.history.loading')}</OverrideLoadingStatus>}
            {!history.loading && !history.error && !history.hasMore && visibleEntries.length === 0 && (
              <p>
                {t(
                  effectiveView === 'active' ? 'reports.override.history.empty' : 'reports.override.history.emptyFull',
                )}
              </p>
            )}
            {history.error && (
              <div role="alert">
                <p>{t('reports.override.history.error')}</p>
                <Button
                  type="button"
                  variant="text"
                  label={t('reports.override.history.retry')}
                  onClick={() => void history.retry()}
                />
              </div>
            )}
            {!history.loading && !history.error && history.hasMore && (
              <Button
                type="button"
                variant="text"
                label={t('reports.override.history.loadMore')}
                onClick={() => void history.loadMore()}
              />
            )}
            {props.undoUnavailableReason === 'LegacyBoundary' && <p>{t('reports.override.undo.legacy')}</p>}
            {(props.undoUnavailableReason === 'Forbidden' || props.undoUnavailableReason === 'TargetUnavailable') && (
              <p>{t('reports.override.undo.unavailable')}</p>
            )}
            {props.undoCandidateId && props.undoDisabledReason && <p>{props.undoDisabledReason}</p>}
          </div>
        </div>
      )}
    </section>
  );
};

export default WorkUnitOverrideHistory;
