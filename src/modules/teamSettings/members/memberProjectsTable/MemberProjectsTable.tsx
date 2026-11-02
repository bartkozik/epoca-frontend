import { useToast } from '@/core/providers/toastProvider';
import Confirmation, { ConfirmationAction } from '@/core/theme/confirmation';
import GoBack from '@/core/theme/goBack';
import LoadingArea from '@/core/theme/loadingArea';
import MainContent from '@/core/theme/mainContent';
import PageLayout from '@/core/theme/pageLayout';
import ScrolledContainer from '@/core/theme/scrolledContainer';
import Select from '@/core/theme/select';
import Toggle from '@/core/theme/toggle';
import { readFromListSearch, showModuleErrorToast, showToastForError } from '@/core/utils/helpers';
import { useTitle } from '@/core/utils/hooks';
import { getClientFilterTypeOptions } from '@/core/utils/options';
import { useClients } from '@/modules/clients/ClientsProvider';
import { useToggleAllProjectsAssignmentMutation } from '@/modules/projects/hooks/useToggleAllProjectsAssignmentMutation';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { teamSettingsPaths } from '../../routes';
import styles from './MemberProjectsTable.module.scss';
import MemberProjectsTableRow from './memberProjectsTableRow';

const MembersProjectsTable = (): JSX.Element | null => {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const projectsContext = useProjects();
  const { handleFilterTypeSelectMemberProjects, resetSelectedFilterType, selectedFilterTypeOptionMembersProjects } =
    useClients();
  const {
    closeAssignmentToAllProjectsConfirmation,
    fetchProjectsAndOrganizationUsers,
    filteredOrganizationProjects,
    getUserProjects,
    isAssignmentToAllProjectsConfirmationOpen,
    isLoading,
    isSubmitting,
    isUserAssignedToAllProjects,
    openAssignmentToAllProjectsConfirmation,
    resetSelectedProjectUser,
    selectedProjectUser,
  } = projectsContext;
  const toggleAllProjectsAssignmentMutation = useToggleAllProjectsAssignmentMutation();

  const { userId } = useParams();

  const listPath = `${teamSettingsPaths.teamSettings('members', 'list')}${readFromListSearch(location.state)}`;

  useTitle(t('team_seatings.members.members_projects_table.title'));

  useEffect(() => {
    fetchProjectsAndOrganizationUsers();
  }, []);

  useEffect(() => {
    if (userId)
      getUserProjects(userId).catch((error) => {
        // Preserve the list's sort (fromListSearch) on this error bail-out too, same as GoBack below.
        navigate(listPath);
        showToastForError({
          errorMessageMap: {
            404: t('toast_message.projects.not_authorized_user_project_edit'),
            default: t('toast_message.users.no_authorization'),
          },
          error,
        });
      });
  }, [userId, getUserProjects]);

  useEffect(() => {
    return () => {
      resetSelectedFilterType();
      resetSelectedProjectUser();
    };
  }, []);

  if (!selectedProjectUser) return null;

  const handleToggleAllProjectsAssignment = (): void => {
    const isAssigned = isUserAssignedToAllProjects;

    toggleAllProjectsAssignmentMutation.mutate(
      { isAssigned },
      {
        onSuccess: () => {
          addToast({
            content: t(isAssigned ? 'toast_message.projects.user_deleted_all' : 'toast_message.projects.user_add_all'),
          });
        },
        onError: (error) => {
          showModuleErrorToast(error, {
            default: t(
              isAssigned
                ? 'toast_message.projects.user_delete_all_failed'
                : 'toast_message.projects.user_add_all_error',
            ),
          });
        },
      },
    );
    closeAssignmentToAllProjectsConfirmation();
  };

  const assignAllConfirmActions: ConfirmationAction[][] = [
    [
      {
        text: t('team_seatings.common.assign_all'),
        action: handleToggleAllProjectsAssignment,
      },
    ],
    [
      {
        text: t('team_seatings.common.unassign_all'),
        action: handleToggleAllProjectsAssignment,
      },
    ],
  ];

  const assignMessage = t('team_seatings.members.members_projects_table.confirmation.message.assign_all', {
    userName: selectedProjectUser.fullName,
  });
  const unassignMessage = t('team_seatings.members.members_projects_table.confirmation.message.unassign_all', {
    userName: selectedProjectUser.fullName,
  });

  return (
    <>
      <ScrolledContainer>
        <MainContent>
          <GoBack
            href={listPath}
            label={t('team_seatings.members.members_projects_table.go_back.back_to_members_list.label')}
          />
          <LoadingArea loading={isSubmitting.userProjects && isLoading.allProjectsViewData}>
            <PageLayout
              sectionName={selectedProjectUser.fullName}
              title={t('team_seatings.members.members_projects_table.page.title.add_or_remove')}
            >
              <div className={styles.memberDetails}>
                <div className={styles.actions}>
                  <Toggle
                    isChecked={isUserAssignedToAllProjects}
                    label={t('team_seatings.members.members_projects_table.page.toggle.set_projects_assignment.label')}
                    stateLabels={{
                      on: t('team_seatings.common.unassign_all'),
                      off: t('team_seatings.common.assign_all'),
                    }}
                    onClick={openAssignmentToAllProjectsConfirmation}
                    loading={toggleAllProjectsAssignmentMutation.isPending}
                  />
                  <Select
                    label={t('team_seatings.members.members_projects_table.page.select.chose_type.label')}
                    transparent
                    className={styles.statusInput}
                    items={getClientFilterTypeOptions()}
                    name="type"
                    onSelect={handleFilterTypeSelectMemberProjects}
                    selectedItem={selectedFilterTypeOptionMembersProjects}
                    size="small"
                  />
                </div>

                <table className={clsx('table', styles.tableCustom)}>
                  <thead>
                    <tr>
                      <th data-th="Project">{t('common.project')}</th>
                      <th data-th="Client">{t('common.client')}</th>
                      <th data-th="Type">{t('common.type')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrganizationProjects.map((project) => (
                      <MemberProjectsTableRow key={project.id} project={project} />
                    ))}
                  </tbody>
                </table>
              </div>
            </PageLayout>
          </LoadingArea>
        </MainContent>
      </ScrolledContainer>

      <Confirmation
        isOpen={isAssignmentToAllProjectsConfirmationOpen}
        actionType="attention"
        confirmActions={!isUserAssignedToAllProjects ? assignAllConfirmActions[0] : assignAllConfirmActions[1]}
        text={!isUserAssignedToAllProjects ? assignMessage : unassignMessage}
        onCancel={closeAssignmentToAllProjectsConfirmation}
        title={t('team_seatings.members.members_projects_table.confirmation.title.attention')}
      />
    </>
  );
};

export default MembersProjectsTable;
