import { guarded } from '@/app/routing/permissionRoute';
import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

const Clients = lazy(() => import('./Clients'));
const ClientDetails = lazy(() => import('./clientDetails/ClientDetails'));

export const clientsPaths = {
  main: '/clients',
  details: (clientId: string, tab: string) => `/clients/${clientId}/${tab}`,
} as const;

const CLIENT_ID_PARAM = ':clientId';
const TAB_PARAM = ':tab';

export const clientsRoutes: RouteObject[] = [
  guarded(ROLE_PERMISSIONS.Internal, [
    { path: clientsPaths.main, Component: Clients },
    { path: clientsPaths.details(CLIENT_ID_PARAM, TAB_PARAM), Component: ClientDetails },
  ]),
];
