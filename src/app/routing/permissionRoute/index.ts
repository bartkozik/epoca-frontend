import { OrganizationUserRole } from '@/modules/organizations/types';
import { createElement, lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

const PermissionRoute = lazy(() => import('./PermissionRoute'));

// lazy() must target a page's concrete file, never its index.ts barrel -- module barrels no
// longer re-export *Paths/*Routes at all, so every consumer imports the concrete routes.ts file.
export const guarded = (allowedRoles: OrganizationUserRole[], children: RouteObject[]): RouteObject => ({
  element: createElement(PermissionRoute, { allowedRoles }),
  children,
});
