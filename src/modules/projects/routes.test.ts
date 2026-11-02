import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import type { OrganizationUserRole } from '@/modules/organizations/types';
import type { ReactElement } from 'react';
import { projectsPaths, projectsRoutes } from './routes';

describe('projectsRoutes', () => {
  it('exposes projects paths', () => {
    expect(projectsPaths.main).toBe('/projects');
    expect(projectsPaths.details('p1', 'overview')).toBe('/projects/p1/overview');
  });

  it('defines one guarded group with 2 child routes, restricted to internal roles', () => {
    expect(projectsRoutes).toHaveLength(1);
    expect(projectsRoutes[0].children).toHaveLength(2);

    const guardElement = projectsRoutes[0].element as ReactElement<{ allowedRoles: OrganizationUserRole[] }>;
    expect(guardElement.props.allowedRoles).toBe(ROLE_PERMISSIONS.Internal);

    expect(projectsRoutes[0].children?.[0].path).toBe('/projects');
    expect(projectsRoutes[0].children?.[1].path).toBe('/projects/:projectId/:tab');
  });
});
