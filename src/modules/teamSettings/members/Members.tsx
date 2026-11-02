import Button from '@/core/theme/button';
import ButtonGroup from '@/core/theme/buttonGroup';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { teamSettingsPaths } from '../routes';
import Invitations from './invitations';
import { useInvitationDeliveryNotifications } from './invitations/hooks/useInvitationDeliveryNotifications';
import { useInvitationsQuery } from './invitations/hooks/useInvitationsQuery';
import InvitationForm from './invitations/InvitationForm';
import styles from './Members.module.scss';
import MembersTable from './membersTable';

const Members = (): JSX.Element => {
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug ?? '';

  useEffect(() => {
    void workspace.fetchContextOrganizationUsers();
  }, []);

  return <MembersSession key={organizationSlug} organizationSlug={organizationSlug} />;
};

type MembersSessionProps = { organizationSlug: string };

const MembersSession = ({ organizationSlug }: MembersSessionProps): JSX.Element => {
  const { t } = useTranslation();
  const invitations = useInvitationsQuery(organizationSlug);
  const navigate = useNavigate();
  const { memberTab } = useParams();
  const [adding, setAdding] = useState(false);
  const unavailable = invitations.error?.status === 404 || invitations.error?.status === 403;
  const page = unavailable ? undefined : invitations.data;
  const onDeliveryResult = useInvitationDeliveryNotifications(page?.results);
  const hasInvitationCapability = page?.featureEnabled === true;
  const canAdd = hasInvitationCapability && !invitations.isError;

  const buttons = [
    {
      label: t('team_seatings.tab.members'),
      value: 'list',
      onClick: () => navigate(teamSettingsPaths.teamSettings('members', 'list')),
    },
    {
      label: t('invitations.tab'),
      value: 'invitations',
      onClick: () => navigate(teamSettingsPaths.teamSettings('members', 'invitations')),
      disabled: organizationSlug === '' || invitations.isLoading || unavailable,
      loading: invitations.isLoading,
    },
  ];

  useEffect(() => {
    if (unavailable || page?.featureEnabled === false) setAdding(false);
  }, [unavailable, page?.featureEnabled]);

  const activeTabContent =
    memberTab === 'invitations' ? (
      <Invitations
        organizationSlug={organizationSlug}
        data={page}
        isLoading={invitations.isLoading}
        error={invitations.error}
        onRefresh={() => void invitations.refetch()}
        onDeliveryResult={onDeliveryResult}
      />
    ) : (
      <MembersTable />
    );

  return (
    <div className={styles.root}>
      <div className={styles.buttonsContainer}>
        <ButtonGroup className={styles.buttonGroup} buttons={buttons} activeButton={memberTab} />
        {canAdd && (
          <Button className={styles.inviteButton} label={t('invitations.form.title')} onClick={() => setAdding(true)} />
        )}
      </div>
      <div className={styles.tabContent}>{activeTabContent}</div>
      {hasInvitationCapability && page && (
        <InvitationForm
          existingInvitations={page.results}
          onDeliveryResult={(result) => {
            onDeliveryResult(result);
            if (memberTab !== 'invitations') navigate(teamSettingsPaths.teamSettings('members', 'invitations'));
          }}
          isOpen={adding}
          organizationSlug={organizationSlug}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
};

export default Members;
