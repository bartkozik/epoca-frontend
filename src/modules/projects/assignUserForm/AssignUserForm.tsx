import { useToast } from '@/core/providers/toastProvider';
import Button from '@/core/theme/button';
import FormHeader from '@/core/theme/FormHeader';
import { SelectOption } from '@/core/theme/inputs';
import LoadingArea from '@/core/theme/loadingArea';
import Search from '@/core/theme/search';
import Select from '@/core/theme/select';
import { showModuleErrorToast } from '@/core/utils/helpers';
import { ProjectUserRoleOption } from '@/core/utils/option-types';
import { getProjectUserRoleOptions } from '@/core/utils/options';
import { organizationUserToUser } from '@/modules/organizations/modelOrganizationUser';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useAssignUserMutation } from '@/modules/projects/hooks/useAssignUserMutation';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import { FormEvent, MouseEventHandler, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';

interface AssignMemberFormProps {
  onCancel: MouseEventHandler<HTMLButtonElement>;
}

const AssignUserForm = ({ onCancel }: AssignMemberFormProps): JSX.Element => {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const projectsContext = useProjects();

  const workspace = useWorkspace();
  const {
    closeAssignProjectUserModal,
    selectedProject,
    selectedProjectUser,
    selectedProjectUserRoleOption,
    selectedUserRole,
    setSelectedProjectUser,
    setSelectedUserRole,
  } = projectsContext;
  const { contextOrganizationUsers, fetchContextOrganizationUsers, isInitialLoadingContextOrganizationUsers } =
    workspace;
  const assignUserMutation = useAssignUserMutation();
  const assignedUserIds = new Set(selectedProject?.projectUsers?.map(({ id }) => id) ?? []);
  const availableUsersOptions = contextOrganizationUsers
    .filter(({ id, archived }) => !archived && !assignedUserIds.has(id))
    .map(({ id, displayedName, email }) => ({ value: id, label: displayedName, email }));

  useEffect(() => {
    void fetchContextOrganizationUsers();
  }, []);

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!selectedProjectUser || !selectedProject || !selectedUserRole || assignedUserIds.has(selectedProjectUser.id))
      return;

    assignUserMutation.mutate(
      { userId: selectedProjectUser.id, projectId: selectedProject.id, role: selectedUserRole },
      {
        onSuccess: () => {
          closeAssignProjectUserModal();
          addToast({ content: i18n.t('toast_message.projects.user_add') });
        },
        onError: (error) => showModuleErrorToast(error, { default: i18n.t('toast_message.projects.user_add_error') }),
      },
    );
  };

  const handleOnSelect = ({ value }: SelectOption): void => {
    const user = contextOrganizationUsers.find(({ id }) => id === value);
    if (user) setSelectedProjectUser(organizationUserToUser(user));
  };

  const handleSearchChange = (): void => {
    setSelectedProjectUser(null);
  };

  return (
    <LoadingArea loading={isInitialLoadingContextOrganizationUsers}>
      <form className="form" onSubmit={handleSubmit}>
        <FormHeader title={t('projects.common.assign_user')} />
        <Search
          items={availableUsersOptions}
          label={t('projects.assign_user_form.search.assign_list.label')}
          name="User Select"
          onChange={handleSearchChange}
          onSelect={handleOnSelect}
          placeholder={t('projects.assign_user_form.search.assign_list.placeholder')}
          withCheckbox
          value={selectedProjectUser?.fullName}
        />
        <Select
          items={getProjectUserRoleOptions()}
          label={t('projects.assign_user_form.select.role.label')}
          name="status"
          onSelect={({ value }: ProjectUserRoleOption) => setSelectedUserRole(value)}
          selectedItem={selectedProjectUserRoleOption}
          size="normal"
        />
        <div>
          <Button label={t('common.cancel')} onClick={onCancel} variant="text" />
          <Button
            disabled={!selectedProjectUser || assignUserMutation.isPending}
            label={t('projects.common.assign_user')}
            loading={assignUserMutation.isPending}
            type="submit"
            variant="contained"
          />
        </div>
      </form>
    </LoadingArea>
  );
};

export default AssignUserForm;
