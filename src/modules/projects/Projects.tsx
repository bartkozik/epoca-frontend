import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import DataTableLayout from '@/core/theme/dataTableLayout';
import Modal from '@/core/theme/modal';
import ScrolledContainer from '@/core/theme/scrolledContainer';
import { normalizedString, showModuleErrorToast } from '@/core/utils/helpers';
import { useTitle } from '@/core/utils/hooks';
import { getProjectStatusOptions } from '@/core/utils/options';
import { useAuth } from '@/modules/auth/AuthProvider';
import { useClients } from '@/modules/clients/ClientsProvider';
import { useProjectsQuery } from '@/modules/projects/hooks/useProjectsQuery';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import { ProjectStatus } from '@/modules/projects/types';
import { useProjectsURLParams } from '@/modules/projects/useProjectsURLParams';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ProjectForm from './projectForm';
import styles from './Projects.module.scss';
import ProjectsBoard from './projectsBoard';

function Projects(): JSX.Element {
  const { t } = useTranslation();
  const projectsContext = useProjects();
  const { isLoadingClients } = useClients();
  const auth = useAuth();
  const { hasAccess } = auth;
  const {
    closeAddNewProjectModal,
    fetchAllProjectsViewData,
    isAddNewProjectModalOpen,
    isLoading: projectsProviderLoading,
    openAddNewProjectModal,
  } = projectsContext;

  const projectsQuery = useProjectsQuery();
  const { query, selectedStatus, sortColumn, sortDirection, setQuery, setSelectedStatus, updateSort, resetFilters } =
    useProjectsURLParams();

  useTitle(t('common.projects'));

  // useProjectsQuery has no error toast of its own -- without this a failed fetch looked like an
  // empty list.
  useEffect(() => {
    if (projectsQuery.isError)
      showModuleErrorToast(projectsQuery.error, { default: t('toast_message.projects.data_fetch_error') });
  }, [projectsQuery.error, projectsQuery.isError, t]);

  useEffect(() => {
    // Shared query keys deduplicate this bootstrap with useProjectsQuery.
    // Clients and workspace members must also load before the create form is enabled.
    fetchAllProjectsViewData();
  }, []);

  // fetchAllProjectsViewData also fetches clients/org users that ProjectForm's dropdowns need --
  // without waiting on it too, the projects-list query could resolve first and let "add project"
  // open the form while clientsOptions is still empty. Search now resyncs via useSyncedState, so a
  // late-arriving client list no longer gets stuck once the dropdown is open -- this gate is now
  // just UX, avoiding the brief empty/loading flash while fetchClients is still in flight.
  const isLoading = isLoadingClients || projectsQuery.isLoading || projectsProviderLoading.allProjectsViewData;

  const projects = useMemo(
    () => (projectsQuery.data?.results ?? []).map(projectsContext.modelProject),
    [projectsQuery.data, projectsContext],
  );

  const filteredProjects = useMemo(() => {
    const normalizedQuery = normalizedString(query);
    return projects.filter((p) => {
      const normalizedProjectName = normalizedString(p.name);
      const normalizedClientName = normalizedString(p.client.name);
      const isQueryMatch =
        normalizedProjectName.includes(normalizedQuery) || normalizedClientName.includes(normalizedQuery);
      const isStatusMatch = selectedStatus === ProjectStatus.Active ? !p.archivedAt : Boolean(p.archivedAt);
      return isQueryMatch && isStatusMatch;
    });
  }, [projects, query, selectedStatus]);

  const isResetVisible = selectedStatus !== ProjectStatus.Active || Boolean(query);

  const restrictedAccess = !hasAccess(ROLE_PERMISSIONS.Manager);

  const searchBarProps = {
    buttonLabel: t('common.add_new_project'),
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
    handleInputReset: resetFilters,
    handleStatusSelect: (option: { value: ProjectStatus }) => setSelectedStatus(option.value),
    isAddBtnHidden: restrictedAccess,
    isNoSearchItem: filteredProjects.length === 0,
    isResetBtnVisible: isResetVisible,
    openNewItemForm: openAddNewProjectModal,
    placeholder: t('projects.search_bar.placeholder.search_by_name_or_client'),
    query,
    selectedStatusOption: getProjectStatusOptions().find(({ value }) => value === selectedStatus),
    selectStatusItems: getProjectStatusOptions(),
    withSearchInput: true,
  };

  return (
    <>
      <ScrolledContainer>
        <DataTableLayout
          btnLabel={t('common.add_new_project')}
          isSearchBarVisible={!isLoading && projects.length !== 0}
          noDataFoundWithoutButton={restrictedAccess}
          loading={isLoading}
          noItemsLabel={t('common.no_project_added')}
          onBtnClick={openAddNewProjectModal}
          searchBarProps={searchBarProps}
          title={t('common.projects')}
        >
          <ProjectsBoard
            projects={filteredProjects}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            updateSort={updateSort}
          />
        </DataTableLayout>
      </ScrolledContainer>

      <Modal className={styles.modal} close={closeAddNewProjectModal} isOpen={isAddNewProjectModalOpen}>
        <ProjectForm onCancel={closeAddNewProjectModal} />
      </Modal>
    </>
  );
}

export default Projects;
