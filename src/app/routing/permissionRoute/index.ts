import { OrganizationUserRole } from '@/modules/organizations/types';
import { createElement, lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

const PermissionRoute = lazy(() => import('./PermissionRoute'));

export const guarded = (allowedRoles: OrganizationUserRole[], children: RouteObject[]): RouteObject => ({
  element: createElement(PermissionRoute, { allowedRoles }),
  children,
});
