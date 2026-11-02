import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import type { OrganizationUserRole } from '@/modules/organizations/types';
import type { ReactElement } from 'react';
import { clientsPaths, clientsRoutes } from './routes';

describe('clientsRoutes', () => {
  it('exposes clients paths', () => {
    expect(clientsPaths.main).toBe('/clients');
    expect(clientsPaths.details('c1', 'overview')).toBe('/clients/c1/overview');
  });

  it('defines one guarded group with 2 child routes, restricted to internal roles', () => {
    expect(clientsRoutes).toHaveLength(1);
    expect(clientsRoutes[0].children).toHaveLength(2);

    const guardElement = clientsRoutes[0].element as ReactElement<{ allowedRoles: OrganizationUserRole[] }>;
    expect(guardElement.props.allowedRoles).toBe(ROLE_PERMISSIONS.Internal);

    expect(clientsRoutes[0].children?.[0].path).toBe('/clients');
    expect(clientsRoutes[0].children?.[1].path).toBe('/clients/:clientId/:tab');
  });
});
