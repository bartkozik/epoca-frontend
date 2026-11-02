import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import type { OrganizationUserRole } from '@/modules/organizations/types';
import type { ReactElement } from 'react';
import { teamSettingsPaths, teamSettingsRoutes } from './routes';

describe('teamSettingsRoutes', () => {
  it('exposes teamSettings and userDetails path builders', () => {
    expect(teamSettingsPaths.teamSettings('members', 'list')).toBe('/team-settings/members/list');
    expect(teamSettingsPaths.teamSettings('integrations')).toBe('/team-settings/integrations');
    expect(teamSettingsPaths.userDetails('user-1')).toBe('/team-settings/members/list/user-1');
  });

  it('defines one guarded group with 4 child routes, restricted to owners', () => {
    expect(teamSettingsRoutes).toHaveLength(1);
    expect(teamSettingsRoutes[0].children).toHaveLength(4);

    const guardElement = teamSettingsRoutes[0].element as ReactElement<{ allowedRoles: OrganizationUserRole[] }>;
    expect(guardElement.props.allowedRoles).toBe(ROLE_PERMISSIONS.Owner);

    expect(teamSettingsRoutes[0].children?.[0].path).toBe('/team-settings');
    expect(teamSettingsRoutes[0].children?.[1].path).toBe('/team-settings/:tab');
    expect(teamSettingsRoutes[0].children?.[2].path).toBe('/team-settings/:tab/:memberTab');
    expect(teamSettingsRoutes[0].children?.[3].path).toBe('/team-settings/members/list/:userId');
  });
});
