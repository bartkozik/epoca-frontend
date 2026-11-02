import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

// lazy() targets the concrete component file directly, not the ./ssoLoginCallback sub-barrel --
// see permissionRoute/index.ts's rule 1 and auth/routes.ts for the full rationale.
const SsoLoginCallback = lazy(() => import('./ssoLoginCallback/SsoLoginCallback'));

export const ssoAuthPaths = {
  loginSSO: '/login-sso',
} as const;

export const ssoAuthRoutes: RouteObject[] = [{ path: ssoAuthPaths.loginSSO, Component: SsoLoginCallback }];
