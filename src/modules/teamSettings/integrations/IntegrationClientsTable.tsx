import Button from '@/core/theme/button';
import Icon, { icons } from '@/core/theme/icon';
import { useOnClickOutside } from '@/core/utils/hooks/useOnClickOutside';
import type { IntegrationClient } from '@/modules/integrationClients/types';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { formatIntegrationClientDateTime } from './dateTime';
import styles from './IntegrationClientsTable.module.scss';

export interface IntegrationClientsTableProps {
  actionsDisabled?: boolean;
  readOnly?: boolean;
  clients: IntegrationClient[];
  count: number;
  locale: string;
  isLoadingMore?: boolean;
  onDetails?: (client: IntegrationClient) => void;
  onActionTriggerRef?: (clientId: string, button: HTMLButtonElement | null) => void;
  onEdit?: (client: IntegrationClient) => void;
  onLoadMore?: () => void;
  onRotate?: (client: IntegrationClient) => void;
  onRevoke?: (client: IntegrationClient) => void;
}

const shortenClientId = (clientId: string): string =>
  clientId.length > 16 ? `${clientId.slice(0, 8)}…${clientId.slice(-4)}` : clientId;

type ActionKey = 'details' | 'edit' | 'renew' | 'revoke' | 'rotate';

interface IntegrationClientActionsProps {
  actionsDisabled: boolean;
  readOnly: boolean;
  client: IntegrationClient;
  onDetails?: (client: IntegrationClient) => void;
  onActionTriggerRef?: (clientId: string, button: HTMLButtonElement | null) => void;
  onEdit?: (client: IntegrationClient) => void;
  onRevoke?: (client: IntegrationClient) => void;
  onRotate?: (client: IntegrationClient) => void;
}

const IntegrationClientActions = ({
  actionsDisabled,
  readOnly,
  client,
  onDetails,
  onActionTriggerRef,
  onEdit,
  onRevoke,
  onRotate,
}: IntegrationClientActionsProps): JSX.Element | null => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useOnClickOutside({ ref: rootRef, handler: () => setIsOpen(false) });

  const actions: Array<{ callback?: (selectedClient: IntegrationClient) => void; key: ActionKey }> = [
    { callback: onDetails, key: 'details' as const },
    ...(client.status === 'Active'
      ? [
          { callback: onEdit, key: 'edit' as const },
          { callback: onRotate, key: 'rotate' as const },
        ]
      : []),
    ...(client.status === 'Expired' ? [{ callback: onEdit, key: 'renew' as const }] : []),
    ...(client.status !== 'Revoked' ? [{ callback: onRevoke, key: 'revoke' as const }] : []),
  ].filter(({ callback }) => Boolean(callback));

  if (actions.length === 0) return null;

  const runAction = (callback: ((selectedClient: IntegrationClient) => void) | undefined): void => {
    setIsOpen(false);
    triggerRef.current?.focus();
    callback?.(client);
  };

  return (
    <div
      className={styles.actionMenu}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        setIsOpen(false);
        triggerRef.current?.focus();
      }}
      ref={rootRef}
    >
      <button
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-label={`${t('team_seatings.integrations.column.actions')}: ${client.name}`}
        className={styles.actionTrigger}
        disabled={actionsDisabled}
        onClick={() => setIsOpen((open) => !open)}
        ref={(button) => {
          triggerRef.current = button;
          onActionTriggerRef?.(client.clientId, button);
        }}
        type="button"
      >
        <span>{t('team_seatings.integrations.column.actions')}</span>
        <Icon className={clsx({ [styles.actionArrowOpen]: isOpen })} height={7} icon={icons.arrowDown} width={12} />
      </button>
      <div
        aria-label={`${t('team_seatings.integrations.column.actions')}: ${client.name}`}
        className={clsx(styles.actionMenuContent, { [styles.actionMenuOpen]: isOpen })}
        id={menuId}
        role="group"
      >
        {actions.map(({ callback, key }) => {
          const label = t(`team_seatings.integrations.action.${key}`);

          return (
            <Button
              aria-label={`${label}: ${client.name}`}
              disabled={actionsDisabled || (readOnly && key !== 'details')}
              key={key}
              label={label}
              onClick={() => runAction(callback)}
              size="medium"
              tabIndex={isOpen ? 0 : -1}
              variant="text"
            />
          );
        })}
      </div>
    </div>
  );
};

const IntegrationClientsTable = ({
  actionsDisabled = false,
  readOnly = false,
  clients,
  count,
  isLoadingMore = false,
  locale,
  onDetails,
  onActionTriggerRef,
  onEdit,
  onLoadMore,
  onRotate,
  onRevoke,
}: IntegrationClientsTableProps): JSX.Element => {
  const { t } = useTranslation();
  const hasMore = clients.length < count;
  const invalidDateFallback = t('team_seatings.integrations.date_unavailable');

  return (
    <div>
      <p className={styles.count}>{t('team_seatings.integrations.count', { count })}</p>
      <div className={styles.tableScroll}>
        <table aria-label={t('team_seatings.integrations.heading')} className={clsx('table', styles.tableCustom)}>
          <thead>
            <tr>
              <th scope="col">{t('team_seatings.integrations.column.client')}</th>
              <th scope="col">{t('team_seatings.integrations.column.status')}</th>
              <th className={styles.metadataColumn} scope="col">
                {t('team_seatings.integrations.column.expires')}
              </th>
              <th className={styles.metadataColumn} scope="col">
                {t('team_seatings.integrations.column.last_used')}
              </th>
              <th scope="col">{t('team_seatings.integrations.column.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => {
              const statusLabel = t(`team_seatings.integrations.status.${client.status}`);
              const expiration = formatIntegrationClientDateTime(
                client.expiresAt,
                locale,
                t('team_seatings.integrations.no_expiration'),
                invalidDateFallback,
              );
              const lastUsed = formatIntegrationClientDateTime(
                client.lastUsedAt,
                locale,
                t('team_seatings.integrations.never_used'),
                invalidDateFallback,
              );

              return (
                <tr key={client.clientId}>
                  <td className={styles.clientCell}>
                    <span className={styles.clientName}>{client.name}</span>
                    <span className={styles.visuallyHidden}>{client.clientId}</span>
                    <span aria-hidden="true" className={styles.clientIdVisual} title={client.clientId}>
                      {shortenClientId(client.clientId)}
                    </span>
                  </td>
                  <td>
                    <span className={clsx(styles.status, styles[`status${client.status}`])}>
                      <span aria-hidden="true" className={styles.statusDot} />
                      {statusLabel}
                    </span>
                  </td>
                  <td className={styles.metadataColumn}>{expiration}</td>
                  <td className={styles.metadataColumn}>{lastUsed}</td>
                  <td>
                    <IntegrationClientActions
                      readOnly={readOnly}
                      actionsDisabled={actionsDisabled}
                      client={client}
                      onDetails={onDetails}
                      onActionTriggerRef={onActionTriggerRef}
                      onEdit={onEdit}
                      onRevoke={onRevoke}
                      onRotate={onRotate}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasMore && onLoadMore && (
        <div className={styles.pagination}>
          <Button
            aria-label={
              isLoadingMore ? t('team_seatings.integrations.loading_more') : t('team_seatings.integrations.load_more')
            }
            className={styles.paginationButton}
            disabled={isLoadingMore}
            label={t('team_seatings.integrations.load_more')}
            loading={isLoadingMore}
            onClick={onLoadMore}
            variant="outlined"
          />
          <span aria-live="polite" className={styles.visuallyHidden} role="status">
            {isLoadingMore ? t('team_seatings.integrations.loading_more') : ''}
          </span>
        </div>
      )}
    </div>
  );
};

export default IntegrationClientsTable;
