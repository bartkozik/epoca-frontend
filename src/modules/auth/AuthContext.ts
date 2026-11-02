import type { LoggedInUser, Session } from '@/core/models/session';
import type { OrganizationUserRole } from '@/modules/organizations/types';
import { createContext, useContext } from 'react';

export interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  isLogoutInProgress: boolean;
  isAuthenticated: boolean;
  loggedInUser: LoggedInUser | undefined;
  loggedInUserRoles: OrganizationUserRole[];
  userChosenLanguage: string;
  changeUserLanguage: (language: string) => void;
  hasAccess: (roles: OrganizationUserRole[]) => boolean;
  hasAccessInOrganization: (organizationId: string, roles: OrganizationUserRole[]) => boolean;
  login: (username: string, password: string) => Promise<Session>;
  logout: () => Promise<void>;
  persistSession: (token: string, organizationSlug?: string) => Session;
  persistRefreshToken: (token: string) => string;
  refreshAfterPermissionGrant: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
