import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

const WorkspaceSelect = lazy(() => import('./WorkspaceSelect'));

export const workspaceSelectPaths = {
  main: '/select-organization',
} as const;

export const workspaceSelectRoutes: RouteObject[] = [{ path: workspaceSelectPaths.main, Component: WorkspaceSelect }];
