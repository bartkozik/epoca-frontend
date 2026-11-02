import type { ProjectUserRoleOption } from '@/core/utils/option-types';
import type { User, UserAction } from '@/modules/users/types';
import { createContext, useContext } from 'react';
import type { toProject } from './modelProject';
import type { Project, ProjectUser, ProjectUserRole } from './types';

export interface ProjectsContextValue {
  projects: Project[];
  reportedProjects: Project[];
  reportedProjectsLoadError: Error | null;
  isLoadingReportedProjects: boolean;
  filteredOrganizationProjects: Project[];
  selectedProject: Project | null;
  selectedProjectMembers: (User | ProjectUser)[];
  selectedProjectOwners: (User | ProjectUser)[];
  selectedProjectUsers: ProjectUser[];
  selectedProjectUser: User | null;
  selectedUserRole: ProjectUserRole | null;
  selectedProjectUserRoleOption: ProjectUserRoleOption | undefined;
  noProjectMembers: boolean;
  isUserAssignedToAllProjects: boolean;
  isAddNewProjectModalOpen: boolean;
  isAssignProjectUserModalOpen: boolean;
  isAssignmentToAllProjectsConfirmationOpen: boolean;
  isEditProjectModalOpen: boolean;
  isLoading: { allProjectsViewData: boolean; projectDetails: boolean };
  isSubmitting: { userProjects: boolean };
  organizationProjectsCatalogState: 'error' | 'idle' | 'loading' | 'ready';
  isOrganizationProjectsCatalogReady: boolean;
  modelProject: typeof toProject;
  canUserEditProject: (users: ProjectUser[]) => boolean;
  isUserAssignedToProject: (projectId: string) => boolean;
  isProjectUserProjectOwner: (id: string, userId: string) => boolean;
  getSelectedUserRoleOption: (userId: string) => ProjectUserRoleOption | undefined;
  setSelectedProject: (project: Project | null) => void;
  setSelectedProjectMembers: (users: (User | ProjectUser)[]) => void;
  setSelectedProjectOwners: (users: (User | ProjectUser)[]) => void;
  setSelectedProjectUser: (user: User | null) => void;
  resetSelectedProjectUser: () => void;
  setSelectedUserRole: (role: ProjectUserRole) => void;
  initializeProjectData: (project: Project) => void;
  clearAllProjectUsers: () => void;
  handleUserAction: (role: ProjectUserRole, action: UserAction, user: User | ProjectUser) => void;
  fetchProjects: (includeArchivedConnections?: boolean) => Promise<Project[]>;
  fetchAllProjectsViewData: () => void;
  fetchProjectsAndOrganizationUsers: () => void;
  getUserProjects: (userId: string) => Promise<void>;
  openAddNewProjectModal: () => void;
  closeAddNewProjectModal: () => void;
  openAssignProjectUserModal: () => void;
  closeAssignProjectUserModal: () => void;
  openAssignmentToAllProjectsConfirmation: () => void;
  closeAssignmentToAllProjectsConfirmation: () => void;
  openEditProjectModal: (projectId?: string) => void;
  closeEditProjectModal: () => void;
  setLoadingState: (key: string, loading: boolean) => void;
  removeAllProjects: () => void;
}

export const ProjectsContext = createContext<ProjectsContextValue | undefined>(undefined);

export function useProjects(): ProjectsContextValue {
  const context = useContext(ProjectsContext);
  if (!context) throw new Error('useProjects must be used within ProjectsProvider');
  return context;
}
