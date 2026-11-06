import Button from '@/core/theme/button';
import LoadingArea from '@/core/theme/loadingArea';
import Modal from '@/core/theme/modal';
import type { IntegrationClient, IntegrationClientAuditEvent } from '@/modules/integrationClients/types';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatIntegrationClientDateTime } from './dateTime';
import styles from './IntegrationClientDetailsModal.module.scss';

type RequestState = 'idle' | 'loading' | 'success' | 'error';

export type DetailsFocusAction = 'edit' | 'revoke' | 'rotate';

interface IntegrationClientDetailsModalProps {
  readOnly?: boolean;
  auditEvents: readonly IntegrationClientAuditEvent[];
  auditHasNextPage: boolean;
  auditState: RequestState;
  client: IntegrationClient | null;
  detailState: RequestState;
  isBusy?: boolean;
  isDetailFresh: boolean;
  isOpen: boolean;
  locale: string;
  initialFocusAction?: DetailsFocusAction | null;
  onClose: () => void;
  onEdit: (client: IntegrationClient) => void;
  onInitialFocusHandled?: () => void;
  onLoadMoreAudit: () => void;
  onRetryAudit: () => void;
  onRetryDetails: () => void;
  onRevoke: (client: IntegrationClient) => void;
  onRotate: (client: IntegrationClient) => void;
}

interface DetailRowProps {
  label: string;
  children: React.ReactNode;
}

const DetailRow = ({ children, label }: DetailRowProps): JSX.Element => (
  <div className={styles.detailRow}>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
);

const IntegrationClientDetailsModal = ({
  auditEvents,
  auditHasNextPage,
  auditState,
  client,
  detailState,
  isBusy = false,
  isDetailFresh,
  isOpen,
  locale,
  initialFocusAction = null,
  onClose,
  onEdit,
  readOnly = false,
  onInitialFocusHandled,
  onLoadMoreAudit,
  onRetryAudit,
  onRetryDetails,
  onRevoke,
  onRotate,
}: IntegrationClientDetailsModalProps): JSX.Element | null => {
  const { t } = useTranslation();
  const titleId = useId();
  const copyAnnouncementId = useId();
  const editRef = useRef<HTMLButtonElement>(null);
  const revokeRef = useRef<HTMLButtonElement>(null);
  const rotateRef = useRef<HTMLButtonElement>(null);
  const [copyAnnouncement, setCopyAnnouncement] = useState<'copied' | 'failed' | null>(null);
  const invalidDateFallback = t('team_seatings.integrations.date_unavailable');
  const notApplicable = t('team_seatings.integrations.details.not_applicable');
  const never = t('team_seatings.integrations.details.never');
  const date = (value: string | null, fallback = notApplicable): string =>
    formatIntegrationClientDateTime(value, locale, fallback, invalidDateFallback);

  useEffect(() => {
    if (!initialFocusAction || !client || !isDetailFresh || isBusy) return;
    const target =
      initialFocusAction === 'edit'
        ? editRef.current
        : initialFocusAction === 'rotate'
          ? rotateRef.current
          : revokeRef.current;
    if (target && !target.disabled) target.focus();
    onInitialFocusHandled?.();
  }, [client, initialFocusAction, isBusy, isDetailFresh, onInitialFocusHandled]);

  if (!isOpen) return null;

  const copyClientId = (): void => {
    if (!client) return;
    setCopyAnnouncement(null);
    let request: Promise<void>;
    try {
      request = navigator.clipboard.writeText(client.clientId);
    } catch {
      setCopyAnnouncement('failed');
      return;
    }
    void Promise.resolve(request).then(
      () => setCopyAnnouncement('copied'),
      () => setCopyAnnouncement('failed'),
    );
  };

  const lifecycle = (timestamp: string | null, actor: IntegrationClient['revokedBy']): JSX.Element => (
    <span className={styles.lifecycleValue}>
      <span>{date(timestamp)}</span>
      {actor && <span>{actor.displayName}</span>}
    </span>
  );

  const sortedAuditEvents = [...auditEvents].sort(
    (left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
  );
  return (
    <Modal
      ariaLabelledBy={titleId}
      className={styles.modal}
      close={isBusy ? undefined : onClose}
      disableClickOutside={isBusy}
      disableEscapeClickClose={isBusy}
      isOpen={isOpen}
    >
      <h2 className={styles.modalTitle} id={titleId}>
        {t('team_seatings.integrations.details.title')}
      </h2>

      {!client && detailState !== 'error' && (
        <div className={styles.loading}>
          <LoadingArea className={styles.loadingArea} loading />
          <p role="status">{t('team_seatings.integrations.details.loading')}</p>
        </div>
      )}

      {detailState === 'error' && (
        <div className={styles.error} role="alert">
          <p>{t('team_seatings.integrations.details.error')}</p>
          <Button label={t('team_seatings.integrations.details.retry')} onClick={onRetryDetails} variant="outlined" />
        </div>
      )}

      {client && (
        <>
          <div className={styles.headingRow}>
            <div>
              <h3>{client.name}</h3>
              <span className={styles.status} data-status>
                {t(`team_seatings.integrations.status.${client.status}`)}
              </span>
            </div>
            <div className={styles.actions}>
              {client.status === 'Active' && (
                <Button
                  disabled={readOnly || isBusy || !isDetailFresh}
                  forwardedRef={editRef}
                  label={t('team_seatings.integrations.action.edit')}
                  onClick={() => onEdit(client)}
                  size="medium"
                  variant="outlined"
                />
              )}
              {client.status === 'Expired' && (
                <Button
                  disabled={readOnly || isBusy || !isDetailFresh}
                  forwardedRef={editRef}
                  label={t('team_seatings.integrations.action.renew')}
                  onClick={() => onEdit(client)}
                  size="medium"
                  variant="outlined"
                />
              )}
              {client.status === 'Active' && (
                <Button
                  disabled={readOnly || isBusy || !isDetailFresh}
                  forwardedRef={rotateRef}
                  label={t('team_seatings.integrations.action.rotate')}
                  onClick={() => onRotate(client)}
                  size="medium"
                  variant="outlined"
                />
              )}
              {client.status !== 'Revoked' && (
                <Button
                  disabled={readOnly || isBusy || !isDetailFresh}
                  forwardedRef={revokeRef}
                  label={t('team_seatings.integrations.action.revoke')}
                  onClick={() => onRevoke(client)}
                  size="medium"
                  variant="outlined"
                />
              )}
            </div>
          </div>

          <dl className={styles.details}>
            <DetailRow label={t('team_seatings.integrations.details.client_id')}>
              <span className={styles.copyValue}>
                <code>{client.clientId}</code>
                <Button
                  aria-describedby={copyAnnouncement === 'copied' ? copyAnnouncementId : undefined}
                  aria-label={t('team_seatings.integrations.details.copy.client_id')}
                  disabled={isBusy}
                  label={t('team_seatings.integrations.details.copy.client_id')}
                  onClick={copyClientId}
                  size="medium"
                  variant="text"
                />
              </span>
            </DetailRow>
            <DetailRow label={t('team_seatings.integrations.details.status')}>
              {t(`team_seatings.integrations.status.${client.status}`)}
            </DetailRow>
            <DetailRow label={t('team_seatings.integrations.details.service_account')}>
              <span className={styles.serviceAccount}>
                <span>{client.serviceAccount.displayName}</span>
                <code>{client.serviceAccount.userId}</code>
              </span>
            </DetailRow>
            <DetailRow label={t('team_seatings.integrations.details.scopes')}>
              <ul className={styles.tags}>
                {client.scopes.map((scope) => (
                  <li key={scope}>{t(`team_seatings.integrations.form.scope.${scope}`)}</li>
                ))}
              </ul>
            </DetailRow>
            <DetailRow label={t('team_seatings.integrations.details.policy')}>
              <span>{t(`team_seatings.integrations.details.policy.${client.projectAccess.mode}`)}</span>
              {client.projectAccess.mode === 'SelectedProjects' && (
                <div className={styles.projectIds}>
                  <span>{t('team_seatings.integrations.details.policy.project_ids')}</span>
                  <ul>
                    {client.projectAccess.projectIds.map((projectId) => (
                      <li key={projectId}>
                        <code>{projectId}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </DetailRow>
            <DetailRow label={t('team_seatings.integrations.details.expires')}>
              {date(client.expiresAt, t('team_seatings.integrations.no_expiration'))}
            </DetailRow>
            <DetailRow label={t('team_seatings.integrations.details.last_used')}>
              {date(client.lastUsedAt, never)}
            </DetailRow>
            <DetailRow label={t('team_seatings.integrations.details.version.client')}>{client.version}</DetailRow>
            <DetailRow label={t('team_seatings.integrations.details.version.policy')}>{client.policyVersion}</DetailRow>
            <DetailRow label={t('team_seatings.integrations.details.version.secret')}>{client.secretVersion}</DetailRow>
            <DetailRow label={t('team_seatings.integrations.details.created')}>
              {lifecycle(client.createdAt, client.createdBy)}
            </DetailRow>
            <DetailRow label={t('team_seatings.integrations.details.modified')}>
              {lifecycle(client.modifiedAt, client.modifiedBy)}
            </DetailRow>
            <DetailRow label={t('team_seatings.integrations.details.rotated')}>
              {lifecycle(client.secretRotatedAt, client.secretRotatedBy)}
            </DetailRow>
            <DetailRow label={t('team_seatings.integrations.details.revoked')}>
              {lifecycle(client.revokedAt, client.revokedBy)}
            </DetailRow>
          </dl>

          <div
            aria-live="polite"
            className={styles.copyAnnouncement}
            id={copyAnnouncementId}
            role={copyAnnouncement === 'failed' ? 'alert' : 'status'}
          >
            {copyAnnouncement === 'copied'
              ? t('team_seatings.integrations.details.copied.client_id')
              : copyAnnouncement === 'failed'
                ? t('team_seatings.integrations.details.copy_failed')
                : ''}
          </div>

          <section aria-labelledby={`${titleId}-audit`} className={styles.audit}>
            <h3 id={`${titleId}-audit`}>{t('team_seatings.integrations.details.audit.heading')}</h3>
            {auditState === 'loading' && auditEvents.length === 0 && (
              <p role="status">{t('team_seatings.integrations.details.audit.loading')}</p>
            )}
            {auditState === 'error' && (
              <div className={styles.error} role="alert">
                <p>{t('team_seatings.integrations.details.audit.error')}</p>
                <Button
                  label={t('team_seatings.integrations.details.audit.retry')}
                  onClick={onRetryAudit}
                  size="medium"
                  variant="outlined"
                />
              </div>
            )}
            {auditState === 'success' && sortedAuditEvents.length === 0 && (
              <p>{t('team_seatings.integrations.details.audit.empty')}</p>
            )}
            {sortedAuditEvents.length > 0 && (
              <ol className={styles.auditList}>
                {sortedAuditEvents.map((event) => (
                  <li data-audit-event="true" key={event.id}>
                    <div>
                      <strong>{t(`team_seatings.integrations.details.audit.event.${event.eventType}`)}</strong>
                      <span>{t(`team_seatings.integrations.details.audit.outcome.${event.outcome}`)}</span>
                    </div>
                    <div>
                      <span>
                        {event.actor?.displayName ??
                          t(`team_seatings.integrations.details.audit.actor.${event.actorType}`)}
                      </span>
                      <time dateTime={event.occurredAt}>{date(event.occurredAt)}</time>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {auditHasNextPage && (
              <Button
                disabled={auditState === 'loading' || isBusy}
                label={t('team_seatings.integrations.details.audit.load_more')}
                loading={auditState === 'loading'}
                onClick={onLoadMoreAudit}
                size="medium"
                variant="outlined"
              />
            )}
          </section>
        </>
      )}
    </Modal>
  );
};

export default IntegrationClientDetailsModal;
