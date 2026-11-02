import Avatar from '@/core/theme/avatar';
import Confirmation, { ConfirmationAction } from '@/core/theme/confirmation';
import Icon, { icons } from '@/core/theme/icon';
import IconButton from '@/core/theme/iconButton';
import LoadingArea from '@/core/theme/loadingArea';
import Select from '@/core/theme/select';
import { withFromListSearch } from '@/core/utils/helpers';
import { OrganizationUserRoleOption } from '@/core/utils/option-types';
import { getOrganizationUserRoleOptions } from '@/core/utils/options';
import { useChangeOrganizationUserRoleMutation } from '@/modules/organizations/hooks/useAssignOrganizationUserMutation';
import { useOrganizationUsersQuery } from '@/modules/organizations/hooks/useOrganizationUsersQuery';
import {
  getOrganizationUserRoleOption,
  organizationUserToUser,
  toOrganizationUser,
} from '@/modules/organizations/modelOrganizationUser';
import { OrganizationUser } from '@/modules/organizations/types';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { teamSettingsPaths } from '../../routes';
import TeamUsersTable from '../teamUsersTable';
import styles from './MembersTable.module.scss';
import { useDeassignMemberConfirmation } from './useDeassignMemberConfirmation';

const MembersTable = (): JSX.Element => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const workspace = useWorkspace();

  const organizationUsersQuery = useOrganizationUsersQuery();
  const roleMutation = useChangeOrganizationUserRoleMutation();
  const { closeConfirmation, confirmDeassign, isDeassigning, isOpen, openConfirmation } =
    useDeassignMemberConfirmation();

  const activeUsers = (organizationUsersQuery.data ?? []).map(toOrganizationUser).filter(({ archived }) => !archived);

  const renderSelect = (user: OrganizationUser, isOneOfLastTwo = false, compact = false): JSX.Element => (
    <Select
      className={styles.statusInput}
      dropdownPosition={isOneOfLastTwo ? 'top' : 'bottom'}
      items={getOrganizationUserRoleOptions()}
      name={`member-role-${user.id}-${compact ? 'compact' : 'table'}`}
      label={t('team_seatings.members.members_table.column_name.role')}
      onValueChange={({ value }: OrganizationUserRoleOption) => {
        const currentRoleOption = getOrganizationUserRoleOption(user);
        if (!currentRoleOption || currentRoleOption.value === value) return;
        roleMutation.mutate({ userId: user.id, roles: [value] });
      }}
      selectedItem={getOrganizationUserRoleOption(user)}
      size="small"
      loading={roleMutation.isPending && roleMutation.variables?.userId === user.id}
    />
  );

  const handleDetailsClick = (memberId: string): void => {
    // Threads the list's search string through router state so MemberProjectsTable's GoBack
    // (and its own navigate back to this list) can restore the sort instead of resetting it.
    navigate(teamSettingsPaths.userDetails(memberId), { state: withFromListSearch(location.search) });
  };

  const renderRows = (sortedOrganizationUsers: OrganizationUser[]): JSX.Element[] =>
    sortedOrganizationUsers.map((u, i) => {
      const { id } = u;
      const isOneOfLastTwo = i >= sortedOrganizationUsers.length - 2;

      return (
        <tr key={`member:${id}`}>
          <td data-th="User name">
            <Avatar className={styles.avatar} user={organizationUserToUser(u)} />
          </td>
          <td data-th="User role">{renderSelect(u, isOneOfLastTwo)}</td>
          <td data-th="Action">
            <div className={styles.statusMobileView}>{renderSelect(u, isOneOfLastTwo, true)}</div>
            <div className={styles.btnBox}>
              <IconButton
                aria-label={t('common.projects')}
                icon={<Icon icon={icons.cabinet} />}
                label={t('common.projects')}
                onClick={() => handleDetailsClick(id)}
                variant="contained"
              />
              <IconButton
                aria-label={t('team_seatings.members.members_table.icon_button.remove_user.aria_label')}
                icon={<Icon icon={icons.remove} />}
                label={t('common.remove')}
                onClick={() => openConfirmation(id)}
                variant="contained"
              />
            </div>
          </td>
        </tr>
      );
    });

  const confirmationActions: ConfirmationAction[] = [{ text: t('common.remove'), action: confirmDeassign }];

  return (
    <LoadingArea loading={organizationUsersQuery.isLoading || workspace.isLoadingContextOrganizationUsers}>
      <TeamUsersTable items={activeUsers} getName={(user) => user.fullName} getRoles={(user) => user.organizationRoles}>
        {renderRows}
      </TeamUsersTable>

      {activeUsers.length === 0 && !organizationUsersQuery.isError && <p>{t('team_seatings.members.empty')}</p>}
      <Confirmation
        actionType="delete"
        confirmActions={confirmationActions}
        isOpen={isOpen}
        isSubmitting={isDeassigning}
        onCancel={closeConfirmation}
        text={t('team_seatings.members.members_table.confirmation.message.remove_user')}
      />
    </LoadingArea>
  );
};

export default MembersTable;
