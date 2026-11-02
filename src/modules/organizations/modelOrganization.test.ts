import { toOrganization } from './modelOrganization';

describe('toOrganization', () => {
  const raw = {
    archivedAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    createdBy: { id: 'user-1' },
    id: 'org-1',
    modifiedAt: '2024-01-01T00:00:00.000Z',
    modifiedBy: { id: 'user-1' },
    name: 'Acme',
    slug: 'acme',
  };

  it('marks an organization without archivedAt as not archived and starts with no users', () => {
    const result = toOrganization(raw);

    expect(result.archived).toBe(false);
    expect(result.users).toEqual([]);
  });

  it('marks an organization with archivedAt as archived', () => {
    const result = toOrganization({ ...raw, archivedAt: '2024-02-01T00:00:00.000Z' });

    expect(result.archived).toBe(true);
  });
});
