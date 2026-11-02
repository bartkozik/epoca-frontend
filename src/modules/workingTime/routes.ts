import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

const WorkingTime = lazy(() => import('./WorkingTime'));

export const workingTimePaths = {
  main: '/working-time',
} as const;

export const workingTimeRoutes: RouteObject[] = [{ path: workingTimePaths.main, Component: WorkingTime }];
