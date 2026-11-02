import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import noUsersImage from '@/core/theme/assets/images/projectsComponentImages/multitasking.png';
import LoadingArea from '@/core/theme/loadingArea';
import Modal from '@/core/theme/modal';
import EmptyViewBoard from '@/core/theme/noDataFound';
import { useAuth } from '@/modules/auth/AuthProvider';
import AssignedMemberTable from '@/modules/projects/assignedMembers/assignedMemberTable';
import AssignUserForm from '@/modules/projects/assignUserForm';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import styles from './AssignedMembers.module.scss';

function AssignedMembers(): JSX.Element {
  const { t } = useTranslation();
  const projectsContext = useProjects();
  const auth = useAuth();
  const { hasAccess } = auth;
  const {
    closeAssignProjectUserModal,
    isLoading,
    isAssignProjectUserModalOpen,
    noProjectMembers,
    openAssignProjectUserModal,
  } = projectsContext;

  const restrictedAccess = !hasAccess(ROLE_PERMISSIONS.Manager);

  const emptyMembersBoard = (
    <EmptyViewBoard
      buttonLabel={t('projects.assigned_members.empty_view_board.button.add_user.label')}
      image={noUsersImage}
      label={t('projects.assigned_members.empty_view_board.label')}
      onButtonClick={openAssignProjectUserModal}
      withoutButton={restrictedAccess}
    />
  );

  const loadedContent = noProjectMembers ? emptyMembersBoard : <AssignedMemberTable />;

  return (
    <>
      <div className={clsx(styles.root, { [styles.memberBoard]: !noProjectMembers })}>
        <LoadingArea loading={isLoading.projectDetails}>{loadedContent}</LoadingArea>
      </div>

      <Modal className={styles.modal} close={closeAssignProjectUserModal} isOpen={isAssignProjectUserModalOpen}>
        <AssignUserForm onCancel={closeAssignProjectUserModal} />
      </Modal>
    </>
  );
}

export default AssignedMembers;
