import { organizationUserProjectsQueryKey } from '@/modules/organizations/queryKeys';

describe('organizationUserProjectsQueryKey', () => {
  it('is a flat key of the entity prefix, the slug, and the user id', () => {
    expect(organizationUserProjectsQueryKey('acme', 'user-1')).toEqual(['organizationUserProjects', 'acme', 'user-1']);
  });
});
