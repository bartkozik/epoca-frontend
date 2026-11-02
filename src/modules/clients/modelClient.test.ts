import { ClientType } from '@/modules/clients/types';
import { toClient } from './modelClient';

describe('toClient', () => {
  it('derives archived/archivedDate/formattedCreatedAt and starts with no projects', () => {
    const raw = {
      archivedAt: '2024-02-01T00:00:00.000Z',
      color: '#000',
      createdAt: '2024-01-01T00:00:00.000Z',
      createdBy: 'user-1',
      id: 'client-1',
      logo: '',
      modifiedAt: '2024-01-01T00:00:00.000Z',
      modifiedBy: 'user-1',
      name: 'Acme',
      organizationId: 'org-1',
      projectCount: 0,
      texture: 'texture-1',
      type: ClientType.External,
    };

    const result = toClient(raw);

    expect(result.archived).toBe(true);
    expect(result.projects).toEqual([]);
    expect(result.archivedDate).toBeTruthy();
    expect(result.formattedCreatedAt).toBeTruthy();
  });

  it('marks a client without archivedAt as not archived and with an empty archivedDate', () => {
    const raw = {
      archivedAt: '',
      color: '#000',
      createdAt: '2024-01-01T00:00:00.000Z',
      createdBy: 'user-1',
      id: 'client-2',
      logo: '',
      modifiedAt: '2024-01-01T00:00:00.000Z',
      modifiedBy: 'user-1',
      name: 'Beta',
      organizationId: 'org-1',
      projectCount: 3,
      texture: 'texture-1',
      type: ClientType.External,
    };

    const result = toClient(raw);

    expect(result.archived).toBe(false);
  });
});
