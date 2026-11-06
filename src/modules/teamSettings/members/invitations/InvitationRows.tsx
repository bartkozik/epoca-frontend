import { OrganizationUserRole } from '@/core/models/enums';
import { useToast } from '@/core/providers/toastProvider';
import Avatar from '@/core/theme/avatar';
import Button from '@/core/theme/button';
import Confirmation from '@/core/theme/confirmation';
import Icon, { icons } from '@/core/theme/icon';
import IconButton from '@/core/theme/iconButton';
import Select from '@/core/theme/select';
import { useCooldown } from '@/core/utils/hooks/useCooldown';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { useCancelInvitationMutation } from './hooks/useCancelInvitationMutation';
import { useInvitationConflict } from './hooks/useInvitationConflict';
import { usePendingAction } from './hooks/usePendingAction';
import { useResendInvitationMutation } from './hooks/useResendInvitationMutation';
import { useUpdateInvitationMutation } from './hooks/useUpdateInvitationMutation';
import InvitationCompletionModal from './InvitationCompletionModal';
import InvitationLatestState from './InvitationLatestState';
import styles from './InvitationRows.module.scss';
import type { InvitationDto } from './models/invitationDto.model';
import { normalizeInvitationProblem, type InvitationProblem } from './problem';
import { invitationDeliveryToast } from './utils/invitation-delivery-toast';
import { invitationProblemMessage, invitationRoleItems } from './utils/invitation-form';
import {
  invitationDelivery,
  invitationDisplayName,
  invitationRole,
  isEmailInvitation,
  isListedInvitation,
  isWaitingInvitation,
  needsInvitationCompletion,
} from './utils/invitation-management';

type Props = {
  onDeliveryResult?: (result: InvitationDto) => void;
  organizationSlug: string;
  invitations: InvitationDto[];
  featureEnabled: boolean;
  readOnly?: boolean;
};
type Action = ({ kind: 'role'; role: OrganizationUserRole } | { kind: 'resend' | 'cancel' }) & {
  expectedRevision?: string;
};
type ModalSelection = { invitation: InvitationDto; mode: 'complete' | 'resend'; onSaved: () => void };

const InvitationRows = (props: Props): JSX.Element => {
  return <InvitationRowsSession key={props.organizationSlug} {...props} />;
};

const InvitationRowsSession = ({ invitations, ...props }: Props): JSX.Element => {
  const [selection, setSelection] = useState<ModalSelection | null>(null);

  useEffect(() => {
    if (!props.featureEnabled) setSelection((current) => (current?.mode === 'resend' ? null : current));
  }, [props.featureEnabled]);

  return (
    <>
      {invitations.filter(isListedInvitation).map((invitation) => (
        <InvitationRow
          key={`invitation:${invitation.id}`}
          invitation={invitation}
          {...props}
          onOpen={setSelection}
          modalOpen={selection?.invitation.id === invitation.id}
        />
      ))}
      {!props.readOnly && selection && (
        <InvitationCompletionModal
          onDeliveryResult={props.onDeliveryResult}
          organizationSlug={props.organizationSlug}
          invitation={selection.invitation}
          resend={selection.mode === 'resend'}
          onClose={() => setSelection(null)}
          onSaved={selection.onSaved}
        />
      )}
    </>
  );
};

type InvitationRowProps = Omit<Props, 'invitations'> & {
  invitation: InvitationDto;
  onOpen: (selection: ModalSelection) => void;
  modalOpen: boolean;
};

const InvitationRow = ({
  invitation,
  onDeliveryResult,
  organizationSlug,
  featureEnabled,
  readOnly = false,
  onOpen,
  modalOpen,
}: InvitationRowProps): JSX.Element => {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const update = useUpdateInvitationMutation();
  const resend = useResendInvitationMutation();
  const cancel = useCancelInvitationMutation();
  const { active, pendingRef, pending, run } = usePendingAction();
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [problem, setProblem] = useState<InvitationProblem | null>(null);
  const { conflict, setConflict, latest, refreshing, refreshLatest, handleConflict } = useInvitationConflict({
    organizationSlug,
    invitationId: invitation.id,
  });
  const [reviewed, setReviewed] = useState<InvitationDto | null>(null);
  const [retryAction, setRetryAction] = useState<Action | null>(null);
  const { cooldown: remainingSeconds, setCooldown } = useCooldown(invitation.delivery.retryAfterSeconds);
  const coolingDown = remainingSeconds > 0;
  const current = reviewed && BigInt(reviewed.revision) > BigInt(invitation.revision) ? reviewed : invitation;

  useEffect(() => {
    setCooldown(current.delivery.retryAfterSeconds);
  }, [current.delivery.lastAttemptAt, current.delivery.retryAfterSeconds, setCooldown]);

  const execute = async (action: Action): Promise<void> => {
    if (readOnly || pendingRef.current || conflict || !active.current) return;
    setProblem(null);
    const variables = {
      organizationSlug,
      invitationId: current.id,
      input: { expectedRevision: action.expectedRevision ?? current.revision },
    };

    await run(async () => {
      try {
        let result: InvitationDto | undefined;
        if (action.kind === 'role')
          result = await update.mutateAsync({ ...variables, input: { ...variables.input, role: action.role } });
        else if (action.kind === 'resend') result = await resend.mutateAsync(variables);
        else await cancel.mutateAsync(variables);
        if (!active.current) return;
        setConfirmCancel(null);
        setRetryAction(null);
        setReviewed(null);
        if (result) setCooldown(result.delivery.retryAfterSeconds);
        if (action.kind === 'resend' && result) {
          if (onDeliveryResult) onDeliveryResult(result);
          else addToast(invitationDeliveryToast(result.delivery.status, t));
        } else {
          addToast({ content: t(action.kind === 'cancel' ? 'invitations.cancelled' : 'invitations.saved') });
        }
      } catch (error: unknown) {
        if (!active.current) return;
        const safe = normalizeInvitationProblem(error);
        setProblem(safe);
        setRetryAction({ ...action, expectedRevision: variables.input.expectedRevision });
        setConfirmCancel(null);
        if (safe.retryAfterSeconds) setCooldown(safe.retryAfterSeconds);
        await handleConflict(safe);
      }
    });
  };

  const openModal = (mode: ModalSelection['mode']): void => {
    if (readOnly) return;
    onOpen({
      invitation: current,
      mode,
      onSaved: () => {
        if (!active.current) return;
        setRetryAction(null);
        setProblem(null);
        setReviewed(null);
      },
    });
  };

  const roleItems = invitationRoleItems(t);
  const waiting = isWaitingInvitation(current);
  const deliveryStatus = invitationDelivery(current.delivery.status);
  const cooldownMessage =
    problem?.kind === 'rate-limited' && retryAction?.kind === 'resend'
      ? 'invitations.cooldown.rateLimited'
      : deliveryStatus === 'Sent'
        ? 'invitations.cooldown.sent'
        : 'invitations.cooldown.retry';
  const editable = waiting && isEmailInvitation(current);

  const roleSelect = (compact: boolean): JSX.Element =>
    editable ? (
      <Select
        name={`invitation-role-${current.id}-${compact ? 'compact' : 'table'}`}
        label={t('invitations.form.role')}
        className={styles.statusInput}
        size="small"
        items={roleItems}
        selectedItem={roleItems.find(({ value }) => value === invitationRole(current))}
        readOnly={readOnly || pending || conflict || modalOpen || confirmCancel !== null}
        onSelect={({ value }) => {
          if (needsInvitationCompletion(current)) {
            openModal('complete');

            return;
          }
          if (value !== invitationRole(current))
            void execute(
              retryAction?.kind === 'role' && retryAction.role === value ? retryAction : { kind: 'role', role: value },
            );
        }}
      />
    ) : (
      <span>
        {current.roles.map((role) => roleItems.find(({ value }) => String(value) === role)?.label ?? role).join(', ') ||
          t('invitations.role.unknown')}
      </span>
    );

  return (
    <tr data-invitation-id={current.id}>
      <td data-th="User name">
        <Avatar className={styles.avatar} user={{ fullName: invitationDisplayName(current) }} />
        <div className={styles.invitationDetails}>
          <span>{current.email}</span>
          <span className={styles.invitationStatus}>
            {t(
              `invitations.status.${['Pending', 'Expired', 'Accepted', 'Cancelled'].includes(current.status) ? current.status : 'Unknown'}`,
            )}
          </span>
          <span
            className={clsx(styles.invitationDelivery, {
              [styles.invitationSuccess]: deliveryStatus === 'Sent',
              [styles.invitationError]: deliveryStatus === 'Failed',
              [styles.invitationNotice]: ['Started', 'NotSent'].includes(deliveryStatus),
            })}
          >
            {t(`invitations.delivery.${deliveryStatus}`)}
          </span>
          {coolingDown && waiting && (
            <span role="timer" className={styles.invitationCooldown}>
              {t(cooldownMessage, { seconds: remainingSeconds })}
            </span>
          )}
          {problem && !(problem.kind === 'rate-limited' && problem.retryAfterSeconds) && (
            <span role="alert" className={styles.invitationError}>
              {t(
                conflict
                  ? 'invitations.error.revision-conflict'
                  : `invitations.error.${invitationProblemMessage(problem)}`,
              )}
            </span>
          )}
          {retryAction?.kind === 'role' && (
            <span>{t('invitations.retryRole', { role: t(`invitations.role.${retryAction.role}`) })}</span>
          )}
        </div>
      </td>
      <td data-th="User role">{roleSelect(false)}</td>
      <td data-th="Action">
        <div className={styles.statusMobileView}>{roleSelect(true)}</div>
        <div className={clsx(styles.btnBox, styles.invitationActions)}>
          {editable && featureEnabled && (
            <IconButton
              icon={
                <span aria-hidden="true" className={styles.resendIcon}>
                  <Icon icon={icons.retry} width={24} height={24} />
                </span>
              }
              label={t('invitations.action.resend')}
              disabled={readOnly || pending || conflict || confirmCancel !== null || coolingDown}
              variant="contained"
              onClick={() =>
                needsInvitationCompletion(current)
                  ? openModal('resend')
                  : void execute(retryAction?.kind === 'resend' ? retryAction : { kind: 'resend' })
              }
            />
          )}
          {waiting && (
            <IconButton
              icon={
                <span aria-hidden="true">
                  <Icon icon={icons.remove} />
                </span>
              }
              label={t('invitations.action.cancel')}
              disabled={readOnly || pending || conflict || confirmCancel !== null}
              variant="contained"
              onClick={() =>
                setConfirmCancel(
                  retryAction?.kind === 'cancel'
                    ? (retryAction.expectedRevision ?? current.revision)
                    : current.revision,
                )
              }
            />
          )}
        </div>
        {retryAction && !conflict && waiting && (
          <Button
            label={t('invitations.action.retry')}
            disabled={readOnly || pending || (retryAction.kind === 'resend' && (!featureEnabled || coolingDown))}
            onClick={() =>
              retryAction.kind === 'cancel'
                ? setConfirmCancel(retryAction.expectedRevision ?? current.revision)
                : void execute(retryAction)
            }
          />
        )}
        <Confirmation
          isOpen={!readOnly && confirmCancel !== null}
          isSubmitting={pending}
          actionType="delete"
          text={t('invitations.cancel.confirm')}
          onCancel={() => setConfirmCancel(null)}
          confirmActions={[
            {
              text: t('invitations.action.cancel'),
              action: () => execute({ kind: 'cancel', expectedRevision: confirmCancel ?? current.revision }),
            },
          ]}
        />
        {conflict && (
          <div>
            <InvitationLatestState
              invitation={latest}
              refreshing={refreshing}
              onRefresh={() => void refreshLatest()}
              onReviewed={() => {
                if (latest) {
                  setReviewed(latest);
                  setRetryAction((action) => (action ? { ...action, expectedRevision: latest.revision } : null));
                  setConflict(false);
                  setProblem(null);
                }
              }}
            />
          </div>
        )}
      </td>
    </tr>
  );
};

export default InvitationRows;
