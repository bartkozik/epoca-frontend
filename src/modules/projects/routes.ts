import { guarded } from '@/app/routing/permissionRoute';
import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

const Projects = lazy(() => import('./Projects'));
const ProjectDetails = lazy(() => import('./projectDetails/ProjectDetails'));

export const projectsPaths = {
  main: '/projects',
  details: (projectId: string, tab: string) => `/projects/${projectId}/${tab}`,
} as const;

const PROJECT_ID_PARAM = ':projectId';
const TAB_PARAM = ':tab';

export const projectsRoutes: RouteObject[] = [
  guarded(ROLE_PERMISSIONS.Internal, [
    { path: projectsPaths.main, Component: Projects },
    { path: projectsPaths.details(PROJECT_ID_PARAM, TAB_PARAM), Component: ProjectDetails },
  ]),
];
