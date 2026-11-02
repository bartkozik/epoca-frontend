import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import type { OrganizationUserRole } from '@/modules/organizations/types';
import type { ReactElement } from 'react';
import { pivotTablePaths, pivotTableRoutes } from './routes';

describe('pivotTableRoutes', () => {
  it('exposes the pivot-table path', () => {
    expect(pivotTablePaths.main).toBe('/pivot-table');
  });

  it('defines exactly one guarded route for the pivot-table page, restricted to managers', () => {
    expect(pivotTableRoutes).toHaveLength(1);
    expect(pivotTableRoutes[0].children).toHaveLength(1);
    expect(pivotTableRoutes[0].children?.[0].path).toBe(pivotTablePaths.main);

    const guardElement = pivotTableRoutes[0].element as ReactElement<{ allowedRoles: OrganizationUserRole[] }>;
    expect(guardElement.props.allowedRoles).toBe(ROLE_PERMISSIONS.Manager);
  });
});
