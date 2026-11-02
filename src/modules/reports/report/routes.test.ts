import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import type { OrganizationUserRole } from '@/modules/organizations/types';
import type { ReactElement } from 'react';
import { reportPaths, reportRoutes } from './routes';

describe('reportRoutes', () => {
  it('exposes the report path', () => {
    expect(reportPaths.main).toBe('/report');
  });

  it('defines exactly one guarded route for the report page, open to all roles', () => {
    expect(reportRoutes).toHaveLength(1);
    expect(reportRoutes[0].children).toHaveLength(1);
    expect(reportRoutes[0].children?.[0].path).toBe(reportPaths.main);

    const guardElement = reportRoutes[0].element as ReactElement<{ allowedRoles: OrganizationUserRole[] }>;
    expect(guardElement.props.allowedRoles).toBe(ROLE_PERMISSIONS.All);
  });
});
