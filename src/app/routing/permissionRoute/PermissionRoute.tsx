import { paths } from '@/app/routing/paths';
import LoadingArea from '@/core/theme/loadingArea';
import { useAuth } from '@/modules/auth/AuthProvider';
import { OrganizationUserRole } from '@/modules/organizations/types';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { Navigate, Outlet } from 'react-router-dom';

interface PermissionRouteProps {
  allowedRoles: OrganizationUserRole[];
}

const PermissionRoute = ({ allowedRoles }: PermissionRouteProps): JSX.Element | null => {
  const auth = useAuth();
  const { hasAccessInOrganization } = auth;
  const workspace = useWorkspace();
  const isResolvingCurrentOrganization =
    workspace.isContextOrganizationSlugInLocalStorage &&
    !workspace.contextOrganizationId &&
    !workspace.contextOrganizationLoadFailure;

  if (isResolvingCurrentOrganization) return <LoadingArea loading />;

  return hasAccessInOrganization(workspace.contextOrganizationId ?? '', allowedRoles) ? (
    <Outlet />
  ) : (
    <Navigate to={paths.index} replace />
  );
};

export default PermissionRoute;
