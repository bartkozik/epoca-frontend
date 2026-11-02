import { guarded } from '@/app/routing/permissionRoute';
import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

const PivotTable = lazy(() => import('./PivotTable'));

export const pivotTablePaths = {
  main: '/pivot-table',
} as const;

export const pivotTableRoutes: RouteObject[] = [
  guarded(ROLE_PERMISSIONS.Manager, [{ path: pivotTablePaths.main, Component: PivotTable }]),
];
