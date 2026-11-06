import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import noUsersImage from '@/core/theme/assets/images/projectsComponentImages/multitasking.png';
import LoadingArea from '@/core/theme/loadingArea';
import Modal from '@/core/theme/modal';
import EmptyViewBoard from '@/core/theme/noDataFound';
import { useAuth } from '@/modules/auth/AuthProvider';
import { useClients } from '@/modules/clients/ClientsProvider';
import ProjectForm from '@/modules/projects/projectForm';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import { Project } from '@/modules/projects/types';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import styles from './AssignedProjects.module.scss';
import AssignedProjectsTable from './assignedProjectsTable/AssignedProjectsTable';

interface ProjectFormModalProps {
  project?: Project | null;
  isOpen: boolean;
  close: () => void;
}

const ProjectFormModal = ({ isOpen, close, project }: ProjectFormModalProps): JSX.Element => (
  <Modal className={styles.modal} close={close} isOpen={isOpen}>
    <ProjectForm onCancel={close} project={project} withoutClientSelect />
  </Modal>
);

function AssignedProjects(): JSX.Element | null {
  const { t } = useTranslation();
  const projectsContext = useProjects();
  const auth = useAuth();
  const { hasAccess } = auth;
  const {
    client,
    isAddClientProjectModalOpen,
    isLoadingClientDetails,
    closeAddClientProjectModal,
    fetchClientProjects,
    openAddClientProjectModal,
  } = useClients();
  const { closeEditProjectModal, isEditProjectModalOpen, selectedProject } = projectsContext;

  useEffect(() => {
    if (client) void fetchClientProjects(client.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id]);

  if (!client) return null;

  const { archived, projectCount } = client;

  const restrictedAccess = !hasAccess(ROLE_PERMISSIONS.Manager);

  const emptyProjectsBoard = !archived ? (
    <EmptyViewBoard
      buttonLabel={`${t('common.add_new_project').toLowerCase()}`}
      image={noUsersImage}
      label={t('clients.assigned_projects.empty_project_board.label.no_projects')}
      onButtonClick={() => openAddClientProjectModal(client)}
      withoutButton={restrictedAccess}
    />
  ) : (
    <EmptyViewBoard
      withoutButton
      buttonLabel={`${t('common.add_new_project').toLowerCase()}`}
      image={noUsersImage}
      label={t('clients.assigned_projects.empty_project_board.label.all_projects_archived')}
    />
  );

  const loadedContent = projectCount === 0 ? emptyProjectsBoard : <AssignedProjectsTable />;

  return (
    <>
      <div className={clsx(styles.root, { [styles.projectsTable]: projectCount !== 0 })}>
        <LoadingArea loading={isLoadingClientDetails}>{loadedContent}</LoadingArea>
      </div>

      <ProjectFormModal isOpen={isAddClientProjectModalOpen} close={closeAddClientProjectModal} />
      <ProjectFormModal isOpen={isEditProjectModalOpen} close={closeEditProjectModal} project={selectedProject} />
    </>
  );
}

export default AssignedProjects;
