import { isDemo } from '@/core/config/demo';
import ErrorBoundary from '@/app/routing/errorBoundary';
import NonAuthedPageLayout from '@/app/routing/nonAuthedPageLayout';
import RouteSuspense from '@/app/routing/routeSuspense';
import env from '@/core/config/env';
import { useAuth } from '@/modules/auth/AuthProvider';
import { authPaths, authRoutes, invitationAccessRoutes } from '@/modules/auth/routes';
import { clientsRoutes } from '@/modules/clients/routes';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { workspaceSelectPaths, workspaceSelectRoutes } from '@/modules/organizations/workspaceSelect/routes';
import { projectsRoutes } from '@/modules/projects/routes';
import { pivotTableRoutes } from '@/modules/reports/pivotTable/routes';
import { reportRoutes } from '@/modules/reports/report/routes';
import { ssoAuthRoutes } from '@/modules/ssoAuth/routes';
import { teamSettingsRoutes } from '@/modules/teamSettings/routes';
import { workingTimeRoutes } from '@/modules/workingTime/routes';
import { BrowserRouter, Navigate, useRoutes, type RouteObject } from 'react-router-dom';
import { paths } from './paths';
import ScrollToTop from './ScrollToTop';

const invitationRoutes: RouteObject[] = [
  {
    element: <NonAuthedPageLayout />,
    children: [{ element: <RouteSuspense />, children: [...invitationAccessRoutes, ...ssoAuthRoutes] }],
  },
];

const contextOrganizationSelectionRoutes: RouteObject[] = [
  ...(isDemo ? [] : invitationRoutes),
  {
    element: <RouteSuspense />,
    children: [...workspaceSelectRoutes, { path: '*', element: <Navigate to={workspaceSelectPaths.main} replace /> }],
  },
];

const contextOrganizationRoutes: RouteObject[] = [
  ...(isDemo ? [] : invitationRoutes),
  {
    element: <RouteSuspense withNavbar />,
    children: [
      ...workingTimeRoutes,
      ...clientsRoutes,
      ...projectsRoutes,
      ...reportRoutes,
      ...pivotTableRoutes,
      ...(isDemo ? [] : teamSettingsRoutes),
      { path: '*', element: <Navigate to={paths.index} replace /> },
    ],
  },
];

const nonAuthenticatedRoutes: RouteObject[] = [
  {
    element: <NonAuthedPageLayout />,
    children: [
      {
        element: <RouteSuspense />,
        children: [
          ...authRoutes,
          ...invitationAccessRoutes,
          ...ssoAuthRoutes,
          { path: '*', element: <Navigate replace to={authPaths.login} /> },
        ],
      },
    ],
  },
];

type RouteTreeProps = { routes: RouteObject[] };

const RouteTree = ({ routes }: RouteTreeProps): JSX.Element | null => useRoutes(routes);

const Router = (): JSX.Element => {
  const workspace = useWorkspace();
  const auth = useAuth();
  const { isAuthenticated } = auth;
  const { isContextOrganizationSlugInLocalStorage } = workspace;

  const routes = !isAuthenticated
    ? nonAuthenticatedRoutes
    : !isContextOrganizationSlugInLocalStorage
      ? contextOrganizationSelectionRoutes
      : contextOrganizationRoutes;

  return (
    <BrowserRouter basename={env.publicUrl}>
      <ScrollToTop />
      <ErrorBoundary>
        <RouteTree routes={routes} />
      </ErrorBoundary>
    </BrowserRouter>
  );
};

export default Router;
