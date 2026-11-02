import Button from '@/core/theme/button';
import { useTranslation } from 'react-i18next';
import type { InvitationDto } from './models/invitationDto.model';
import { isWaitingInvitation } from './utils/invitation-management';

type InvitationLatestStateProps = {
  invitation: InvitationDto | null;
  refreshing: boolean;
  onRefresh: () => void;
  onReviewed: () => void;
};

const InvitationLatestState = ({
  invitation,
  refreshing,
  onRefresh,
  onReviewed,
}: InvitationLatestStateProps): JSX.Element => {
  const { t } = useTranslation();

  return (
    <section aria-label={t('invitations.latest.title')}>
      <p>{t('invitations.latest.title')}</p>
      {invitation ? (
        <>
          <p>
            {invitation.firstName} {invitation.lastName} · {invitation.email}
          </p>
          <p>
            {invitation.roles.join(', ') || t('invitations.role.unknown')} ·{' '}
            {t(
              `invitations.status.${['Pending', 'Expired', 'Accepted', 'Cancelled'].includes(invitation.status) ? invitation.status : 'Unknown'}`,
            )}
          </p>
          {isWaitingInvitation(invitation) && <Button label={t('invitations.action.reviewed')} onClick={onReviewed} />}
        </>
      ) : (
        <Button label={t('invitations.action.refresh')} onClick={onRefresh} disabled={refreshing} />
      )}
    </section>
  );
};

export default InvitationLatestState;
