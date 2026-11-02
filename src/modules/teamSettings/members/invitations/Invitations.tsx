import Button from '@/core/theme/button';
import LoadingArea from '@/core/theme/loadingArea';
import { useTranslation } from 'react-i18next';
import TeamUsersTable from '../teamUsersTable';
import InvitationRows from './InvitationRows';
import styles from './Invitations.module.scss';
import type { InvitationDto } from './models/invitationDto.model';
import type { InvitationPage } from './models/invitationList.model';
import type { InvitationProblem } from './problem';
import { invitationDisplayName, isListedInvitation } from './utils/invitation-management';

type InvitationsProps = {
  organizationSlug: string;
  data?: InvitationPage;
  isLoading: boolean;
  error: InvitationProblem | null;
  onRefresh: () => void;
  onDeliveryResult: (result: InvitationDto) => void;
};

const Invitations = ({
  organizationSlug,
  data,
  isLoading,
  error,
  onRefresh,
  onDeliveryResult,
}: InvitationsProps): JSX.Element => {
  const { t } = useTranslation();

  if (error?.status === 404 || error?.status === 403) return <p>{t('invitations.unavailable')}</p>;

  return (
    <div className={styles.root}>
      {error && (
        <div role="alert">
          <p>{t('invitations.error.list')}</p>
          <Button label={t('invitations.action.refresh')} onClick={onRefresh} />
        </div>
      )}
      <LoadingArea loading={isLoading}>
        {data && (
          <>
            <TeamUsersTable
              items={data.results}
              getName={invitationDisplayName}
              getRoles={(invitation) => invitation.roles}
              ariaLabel={t('invitations.tab')}
              actionsLabel={t('invitations.actions')}
            >
              {(sortedInvitations) => (
                <InvitationRows
                  organizationSlug={organizationSlug}
                  invitations={sortedInvitations}
                  featureEnabled={data.featureEnabled}
                  onDeliveryResult={onDeliveryResult}
                />
              )}
            </TeamUsersTable>
            {!data.results.some(isListedInvitation) && !error && (
              <p className={styles.emptyState}>{t('invitations.empty')}</p>
            )}
          </>
        )}
      </LoadingArea>
    </div>
  );
};

export default Invitations;
