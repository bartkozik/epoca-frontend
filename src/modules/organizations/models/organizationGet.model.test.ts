import { organizationQueryKey } from '@/modules/organizations/queryKeys';

describe('organizationQueryKey', () => {
  it('is a flat key of the entity prefix and the slug', () => {
    expect(organizationQueryKey('acme')).toEqual(['organization', 'acme']);
  });
});
