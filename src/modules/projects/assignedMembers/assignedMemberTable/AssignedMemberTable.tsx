import { isDemo } from '@/core/config/demo';
import { useToast } from '@/core/providers/toastProvider';
import Avatar from '@/core/theme/avatar';
import Button from '@/core/theme/button';
import Confirmation, { ConfirmationAction } from '@/core/theme/confirmation';
import Icon, { icons } from '@/core/theme/icon';
import IconButton from '@/core/theme/iconButton';
import InfoIcon from '@/core/theme/infoIcon';
import Select from '@/core/theme/select';
import SortableHeadCell from '@/core/theme/sortableHeadCell';
import { showModuleErrorToast } from '@/core/utils/helpers';
import { ProjectUserRoleOption } from '@/core/utils/option-types';
import { getProjectUserRoleOptions } from '@/core/utils/options';
import { SortColumn, SortDirection } from '@/core/utils/sorting';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useUnassignUserMutation, useUpdateUserRoleMutation } from '@/modules/projects/hooks/useAssignUserMutation';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import { ProjectUserRole } from '@/modules/projects/types';
import { withOrganizationUserEmails } from '@/modules/projects/utils/with-organization-user-emails';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import i18n from 'i18next';
import styles from './AssignedMemberTable.module.scss';
import { useAssignedMembersSortURLParams } from './useAssignedMembersSortURLParams';

function AssignedMemberTable(): JSX.Element | null {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const projectsContext = useProjects();
  const { contextOrganizationUsers } = useWorkspace();
  const {
    canUserEditProject,
    getSelectedUserRoleOption,
    openAssignProjectUserModal,
    selectedProjectUsers,
    selectedProject,
  } = projectsContext;

  const { sortColumn, sortDirection, updateSort } = useAssignedMembersSortURLParams();
  const [userIdToRemove, setUserIdToRemove] = useState<string | null>(null);
  const unassignMutation = useUnassignUserMutation();
  const updateRoleMutation = useUpdateUserRoleMutation();

  if (!selectedProject) return null;

  const { archived, createdBy, projectUsers } = selectedProject;

  const isActionDisabled = selectedProjectUsers.length === 1 || archived;

  const restrictedAccess = isDemo || !canUserEditProject(projectUsers);

  const handleUserRoleChange = (userId: string, newRole: ProjectUserRole): void => {
    const currentRoleOption = getSelectedUserRoleOption(userId);
    if (!currentRoleOption || currentRoleOption.value === newRole) return;

    updateRoleMutation.mutate(
      { userId, projectId: selectedProject.id, role: newRole },
      {
        onSuccess: () => addToast({ content: i18n.t('toast_message.users.user_role_change_success') }),
        onError: (error) =>
          showModuleErrorToast(error, { default: i18n.t('toast_message.users.user_role_change_error') }),
      },
    );
  };

  const handleRemoveUser = (): void => {
    if (!userIdToRemove) return;

    unassignMutation.mutate(
      { userId: userIdToRemove, projectId: selectedProject.id },
      {
        onSuccess: () => addToast({ content: i18n.t('toast_message.users.user_deassigned') }),
        onError: (error) =>
          showModuleErrorToast(error, {
            403: i18n.t('toast_message.projects.not_authorized'),
            default: i18n.t('toast_message.projects.user_delete_failed'),
          }),
      },
    );
    setUserIdToRemove(null);
  };

  const renderSelect = (userId: string): JSX.Element => (
    <Select
      className={clsx(styles.statusInput, { disabled: isActionDisabled })}
      items={getProjectUserRoleOptions()}
      name="status"
      onValueChange={(selectedOption: ProjectUserRoleOption) => handleUserRoleChange(userId, selectedOption.value)}
      readOnly={restrictedAccess || userId === createdBy}
      selectedItem={getSelectedUserRoleOption(userId)}
      size="small"
    />
  );

  const sortedProjectUsers = withOrganizationUserEmails(selectedProjectUsers, contextOrganizationUsers).sort((a, b) => {
    let compare = 0;

    switch (sortColumn) {
      case SortColumn.UserName:
        compare = a.lastName.localeCompare(b.lastName);
        compare = sortDirection === SortDirection.Asc ? -compare : compare;
        break;
      case SortColumn.UserRole:
        compare = a.role.localeCompare(b.role);

        if (compare === 0) compare = a.lastName.localeCompare(b.lastName);
        else compare = sortDirection === SortDirection.Asc ? -compare : compare;

        break;
      default:
        break;
    }

    return compare;
  });

  const assignedMembersList = sortedProjectUsers.map((user) => {
    const { id, fullName } = user;
    const isUserProjectCreator = id === createdBy;

    return (
      <tr key={id}>
        <td data-th="Name">
          <Avatar className={styles.avatar} user={user} isHiddenOnMobile />
        </td>
        <td data-th="Status">{renderSelect(id)}</td>
        <td data-th="Action">
          <span className={styles.usernameMobileView}>{fullName}</span>
          <div className={styles.statusMobileView}>{renderSelect(id)}</div>
          <IconButton
            aria-label={t('projects.assigned_members.assigned_members_table.icon_button.remove_user.aria_label')}
            disabled={isActionDisabled || isUserProjectCreator}
            hidden={restrictedAccess}
            icon={<Icon icon={icons.remove} />}
            label={t('common.remove')}
            onClick={() => setUserIdToRemove(id)}
            variant="contained"
          />
        </td>
      </tr>
    );
  });

  const confirmationActions: ConfirmationAction[] = [{ text: t('common.remove'), action: handleRemoveUser }];

  return (
    <div className={styles.root}>
      <Button
        label={t('projects.common.assign_user')}
        onClick={openAssignProjectUserModal}
        variant="contained"
        className={styles.assignUserButton}
        disabled={archived}
        hidden={restrictedAccess}
      />
      <table className={clsx('table', styles.tableCustom)}>
        <thead>
          <tr>
            <SortableHeadCell
              column={SortColumn.UserName}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              updateSort={updateSort}
            />
            <SortableHeadCell
              column={SortColumn.UserRole}
              icon={
                <InfoIcon
                  iconClassName={styles.headCellInfoIcon}
                  tooltipText={t(
                    'projects.assigned_members.assigned_members_table.icon_info_text.ensure_correct_user_role',
                  )}
                />
              }
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              updateSort={updateSort}
            />
            <th></th>
          </tr>
        </thead>
        <tbody>{assignedMembersList}</tbody>
      </table>

      <Confirmation
        actionType="delete"
        confirmActions={confirmationActions}
        isOpen={userIdToRemove !== null}
        onCancel={() => setUserIdToRemove(null)}
        text={t('projects.assigned_members.assigned_members_table.confirmation.message.delete_user')}
      />
    </div>
  );
}

export default AssignedMemberTable;
