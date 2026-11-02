import { guarded } from '@/app/routing/permissionRoute';
import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

const Report = lazy(() => import('./Report'));

export const reportPaths = {
  main: '/report',
} as const;

export const reportRoutes: RouteObject[] = [
  guarded(ROLE_PERMISSIONS.All, [{ path: reportPaths.main, Component: Report }]),
];
