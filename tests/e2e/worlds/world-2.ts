import { IDS, identityId } from './ids';
import type { WorldDefinition } from './types';

export const world2: WorldDefinition = {
  name: 'world-2',
  parent: 'world-1',
  clock: '2026-07-15T10:00:00.000+02:00',
  locale: 'pl-PL',
  timeZone: 'Europe/Warsaw',
  organization: {
    id: IDS.organization,
    slug: 'epoca-e2e',
    name: 'Epoca E2E',
  },
  actors: {
    owner: {
      userId: IDS.owner,
      email: 'owner@example.test',
      firstName: 'Owner',
      lastName: 'User',
      organizationRoles: ['Owner'],
      projectRoles: {},
      archived: false,
    },
  },
  users: [
    {
      id: IDS.owner,
      email: 'owner@example.test',
      firstName: 'Owner',
      lastName: 'User',
      organizationRoles: ['Owner'],
      archived: false,
      identities: [
        {
          id: identityId(1),
          type: 'MailAddress',
          value: 'owner@example.test',
          main: true,
        },
      ],
    },
  ],
  clients: [],
  projects: [],
  workUnits: [],
  failures: [],
  capabilities: ['organization:empty', 'session:owner'],
};
