import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

const SsoLoginCallback = lazy(() => import('./ssoLoginCallback/SsoLoginCallback'));

export const ssoAuthPaths = {
  loginSSO: '/login-sso',
} as const;

export const ssoAuthRoutes: RouteObject[] = [{ path: ssoAuthPaths.loginSSO, Component: SsoLoginCallback }];
