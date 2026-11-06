import Button from '@/core/theme/button';
import {
  CurrentWorkUnitOverrideHistoryEntrySchema,
  FutureOperationLegacyWorkUnitOverrideHistoryEntrySchema,
  FutureOperationWorkUnitOverrideHistoryEntrySchema,
  LegacyWorkUnitOverrideHistoryEntrySchema,
  type WorkUnitOverrideHistoryEntry,
} from '@/modules/reports/models/workUnitOverride.model';
import { useTranslation } from 'react-i18next';
import styles from './WorkUnitOverrideHistory.module.scss';

export function WorkUnitOverrideHistoryEvent({
  entry,
  compact = false,
  isCurrent = false,
  undoDisabled = false,
  onUndo,
}: {
  entry: WorkUnitOverrideHistoryEntry;
  compact?: boolean;
  isCurrent?: boolean;
  undoDisabled?: boolean;
  onUndo?: (entry: WorkUnitOverrideHistoryEntry) => void;
}): JSX.Element {
  const { t, i18n } = useTranslation();
  const current = CurrentWorkUnitOverrideHistoryEntrySchema.or(
    FutureOperationWorkUnitOverrideHistoryEntrySchema,
  ).safeParse(entry);
  const legacy = LegacyWorkUnitOverrideHistoryEntrySchema.or(
    FutureOperationLegacyWorkUnitOverrideHistoryEntrySchema,
  ).safeParse(entry);
  const operation =
    entry.operation === 'Replace' || entry.operation === 'Clear' || entry.operation === 'Undo'
      ? entry.operation
      : 'unknown';
  const operationKey =
    current.success &&
    current.data.operation === 'Replace' &&
    current.data.before.projectId == null &&
    current.data.before.taskId.mode === 'Inherit'
      ? 'reports.override.history.operation.initial'
      : `reports.override.history.operation.${operation}`;
  const before = current.success ? current.data.before.effective : legacy.success ? legacy.data.legacyBefore : null;
  const after = current.success ? current.data.after.effective : legacy.success ? legacy.data.legacyAfter : null;
  const changes =
    before && after
      ? [
          {
            field: 'client',
            labelKey: 'common.client',
            before: before.projectClient?.clientName,
            after: after.projectClient?.clientName,
            changed: before.projectClient?.clientId !== after.projectClient?.clientId,
          },
          {
            field: 'project',
            labelKey: 'common.project',
            before: before.projectClient?.projectName,
            after: after.projectClient?.projectName,
            changed: before.projectClient?.projectId !== after.projectClient?.projectId,
          },
          {
            field: 'taskId',
            labelKey: 'common.task_id',
            before: before.taskId,
            after: after.taskId,
            changed: before.taskId !== after.taskId,
          },
        ].filter((change) => change.changed || change.before !== change.after)
      : [];
  if (compact) {
    const short = (value: string | null | undefined): string => {
      if (!value) return t('reports.override.history.blank');
      const characters = Array.from(value);
      return characters.length > 40 ? `${characters.slice(0, 39).join('')}…` : value;
    };
    return (
      <span className={styles.compact}>
        <strong>{t(operationKey)}</strong>
        {legacy.success && <span>{t('reports.override.history.legacy')}</span>}
        {changes.map((change) => (
          <span key={change.field}>
            <strong>{t(change.labelKey)}</strong>
            <span>
              {short(change.before)} → {short(change.after)}
            </span>
          </span>
        ))}
        {changes.length === 0 && (
          <span>
            {t(before && after ? 'reports.override.history.noEffectiveChange' : 'reports.override.history.unavailable')}
          </span>
        )}
        {entry.revertedBy && (
          <span>
            {t('reports.override.undo.reverted', { actor: entry.revertedBy.actor.displayName })}{' '}
            <time dateTime={entry.revertedBy.changedAt}>
              {new Date(entry.revertedBy.changedAt).toLocaleString(i18n.language)}
            </time>
          </span>
        )}
        <span>{short(entry.actor.displayName)}</span>
        <time dateTime={entry.changedAt}>{new Date(entry.changedAt).toLocaleString(i18n.language)}</time>
        <span>{t('reports.override.history.fullHint')}</span>
      </span>
    );
  }
  const changedAt = new Date(entry.changedAt);
  const inactive = entry.operation === 'Undo' || entry.revertedBy != null;
  const authorTime = (
    <time dateTime={entry.changedAt}>
      <span>{changedAt.toLocaleDateString(i18n.language)}</span>
      <span>{changedAt.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}</span>
    </time>
  );
  return (
    <article className={inactive ? `${styles.entry} ${styles.inactiveEntry}` : styles.entry}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          {isCurrent && <span className={styles.currentStatus}>{t('reports.override.history.current')}</span>}
          <strong>{t(operationKey)}</strong>
        </div>
        <div className={styles.headerMeta}>
          <strong>{entry.actor.displayName}</strong>
          {authorTime}
        </div>
      </header>
      {current.success && current.data.operation === 'Undo' && (
        <p className={styles.restored}>
          {t(
            current.data.after.projectId == null && current.data.after.taskId.mode === 'Inherit'
              ? 'reports.override.history.restoredOriginal'
              : 'reports.override.history.restoredPrevious',
          )}
        </p>
      )}
      {entry.revertedBy && (
        <p className={styles.reverted}>
          <span>{t('reports.override.undo.reverted', { actor: entry.revertedBy.actor.displayName })}</span>
          <time dateTime={entry.revertedBy.changedAt}>
            {new Date(entry.revertedBy.changedAt).toLocaleString(i18n.language)}
          </time>
        </p>
      )}
      {legacy.success && (
        <>
          <p>{t('reports.override.history.legacy')}</p>
          <p>{t('reports.override.history.originalUnavailable')}</p>
        </>
      )}
      {changes.length > 0 ? (
        <div className={styles.changesScroll}>
          <table className={styles.changesTable}>
            <thead>
              <tr>
                <th scope="col">{t('reports.override.history.field')}</th>
                <th scope="col">{t('reports.override.history.before')}</th>
                <th scope="col">{t('reports.override.history.after')}</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => (
                <tr key={change.field}>
                  <th scope="row">{t(change.labelKey)}</th>
                  <td>{change.before || t('reports.override.history.blank')}</td>
                  <td>{change.after || t('reports.override.history.blank')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>
          {t(before && after ? 'reports.override.history.noEffectiveChange' : 'reports.override.history.unavailable')}
        </p>
      )}
      {!compact &&
        onUndo &&
        current.success &&
        (current.data.operation === 'Replace' || current.data.operation === 'Clear') &&
        current.data.revertedBy == null && (
          <div className={styles.cardFooter}>
            <Button
              type="button"
              variant="text"
              size="small"
              className={styles.undoAction}
              label={t('reports.override.undo.action')}
              disabled={undoDisabled}
              onClick={() => onUndo(entry)}
            />
          </div>
        )}
    </article>
  );
}
