import type { SelectOption } from '@/core/theme/inputs';
import { createContext, useContext } from 'react';
import type { OrganizationLoadFailure } from './organizationLoadFailure';
import type { Organization, OrganizationUser } from './types';

export interface WorkspaceContextValue {
  contextOrganization: Organization | null;
  contextOrganizationId: string | null;
  contextOrganizationSlug: string;
  contextOrganizationUsers: OrganizationUser[];
  contextOrganizationLoadFailure: OrganizationLoadFailure | null;
  activeContextOrganizationUsers: OrganizationUser[];
  availableToAddContextOrganizationUsers: OrganizationUser[];
  availableUsersOptions: SelectOption[];
  contextOrganizationLoggedInUser: OrganizationUser | undefined;
  isContextOrganizationSlugInLocalStorage: boolean;
  isLoadingContextOrganizationUsers: boolean;
  isInitialLoadingContextOrganizationUsers: boolean;
  getContextOrganizationBySlug: (slug: string) => Promise<Organization>;
  fetchContextOrganizationUsers: () => Promise<OrganizationUser[]>;
  resetContextOrganizationId: () => void;
  removeContextOrganizationUser: (userId: string) => void;
  checkIfContextOrganizationSlugIsInLocalStorage: () => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return context;
}
