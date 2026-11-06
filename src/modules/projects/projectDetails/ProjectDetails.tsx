import GoBack from '@/core/theme/goBack';
import LoadingArea from '@/core/theme/loadingArea';
import MainContent from '@/core/theme/mainContent';
import Modal from '@/core/theme/modal';
import PageLayout from '@/core/theme/pageLayout';
import ScrolledContainer from '@/core/theme/scrolledContainer';
import Tabs from '@/core/theme/tabs';
import { readFromListSearch, showModuleErrorToast } from '@/core/utils/helpers';
import { useTitle } from '@/core/utils/hooks';
import AssignedMembers from '@/modules/projects/assignedMembers';
import { useProjectQuery } from '@/modules/projects/hooks/useProjectQuery';
import ProjectDetailsView from '@/modules/projects/projectDetailsView';
import ProjectForm from '@/modules/projects/projectForm';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import modalStyles from '../Projects.module.scss';
import { projectsPaths } from '../routes';


function ProjectDetails(): JSX.Element | null {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId, tab } = useParams();
  const projectsContext = useProjects();
  const { closeEditProjectModal, isEditProjectModalOpen, modelProject, setLoadingState, setSelectedProject } =
    projectsContext;

  const projectQuery = useProjectQuery(projectId);
  const project = useMemo(
    () => (projectQuery.data ? modelProject(projectQuery.data) : undefined),
    [projectQuery.data, modelProject],
  );

  useEffect(() => {
    setSelectedProject(project ?? null);
  }, [project, setSelectedProject]);

  useEffect(() => {
    setLoadingState('projectDetails', projectQuery.isLoading);
  }, [projectQuery.isLoading, setLoadingState]);

  useEffect(() => {
    if (projectQuery.isError)
      showModuleErrorToast(projectQuery.error, { default: t('toast_message.projects.data_fetch_error') });
  }, [projectQuery.error, projectQuery.isError, t]);

  const TABS = [
    {
      value: 'project-details',
      label: t('projects.common.project_details'),
      element: <ProjectDetailsView />,
    },
    {
      value: 'assigned-members',
      label: t('projects.project_details.tabs.assign_members.label'),
      element: <AssignedMembers />,
    },
  ];

  useTitle(TABS.find(({ value }) => value === tab)?.label ?? '');

  const onTabClick = (value: string): void | undefined => {
    if (!projectId) return;
    navigate(projectsPaths.details(projectId, value), { state: location.state as unknown });
  };

  return (
    <>
      <ScrolledContainer>
        <MainContent>
          <GoBack
            href={`${projectsPaths.main}${readFromListSearch(location.state)}`}
            label={t('projects.project_details.go_back.back_to_projects_list.label')}
          />
          <LoadingArea loading={projectQuery.isLoading}>
            {project && (
              <PageLayout sectionName={project.name} title={t('projects.common.project_details')}>
                <Tabs onTabClick={onTabClick} tabs={TABS} />
              </PageLayout>
            )}
          </LoadingArea>
        </MainContent>
      </ScrolledContainer>

      <Modal
        className={modalStyles.modalWithoutClientName}
        close={closeEditProjectModal}
        isOpen={isEditProjectModalOpen}
      >
        <ProjectForm onCancel={closeEditProjectModal} project={project} />
      </Modal>
    </>
  );
}

export default ProjectDetails;
