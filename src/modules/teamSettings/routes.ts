import { guarded } from '@/app/routing/permissionRoute';
import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import { createElement, lazy } from 'react';
import { Navigate, type RouteObject } from 'react-router-dom';

const TeamSettings = lazy(() => import('./TeamSettings'));
const MemberDetails = lazy(() => import('./members/memberProjectsTable/MemberProjectsTable'));

export const teamSettingsPaths = {
  main: '/team-settings',
  teamSettings: (tab: string, memberTab?: string) =>
    memberTab ? `/team-settings/${tab}/${memberTab}` : `/team-settings/${tab}`,
  userDetails: (userId: string) => `/team-settings/members/list/${userId}`,
} as const;

const TAB_PARAM = ':tab';
const MEMBER_TAB_PARAM = ':memberTab';
const USER_ID_PARAM = ':userId';

export const teamSettingsRoutes: RouteObject[] = [
  guarded(ROLE_PERMISSIONS.Owner, [
    {
      path: teamSettingsPaths.main,
      // createElement, not JSX: keeps this a plain .ts file, per the project's PascalCase rule for .tsx.
      element: createElement(Navigate, { replace: true, to: teamSettingsPaths.teamSettings('members', 'list') }),
    },
    { path: teamSettingsPaths.teamSettings(TAB_PARAM), Component: TeamSettings },
    { path: teamSettingsPaths.teamSettings(TAB_PARAM, MEMBER_TAB_PARAM), Component: TeamSettings },
    { path: teamSettingsPaths.userDetails(USER_ID_PARAM), Component: MemberDetails },
  ]),
];
