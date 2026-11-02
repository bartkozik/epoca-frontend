import { IDS, generatedUserId, identityId } from './ids';
import type { WorldDefinition, WorldUser } from './types';

const generatedUsers: WorldUser[] = Array.from({ length: 21 }, (_, index) => {
  const number = index + 6;
  const label = number.toString().padStart(2, '0');
  const email = `person${label}@example.test`;

  return {
    id: generatedUserId(number),
    email,
    firstName: 'Person',
    lastName: label,
    organizationRoles: ['Employee'],
    archived: false,
    identities: [
      {
        id: identityId(number),
        type: 'MailAddress',
        value: email,
        main: true,
      },
    ],
  };
});

export const world4: WorldDefinition = {
  name: 'world-4',
  parent: 'world-3',
  clock: '2026-07-15T10:00:00.000+02:00',
  locale: 'pl-PL',
  timeZone: 'Europe/Warsaw',
  organization: null,
  actors: {},
  users: [
    {
      id: IDS.archivedUser,
      email: 'archived@example.test',
      firstName: 'Archived',
      lastName: 'User',
      organizationRoles: ['External'],
      archived: true,
      identities: [
        {
          id: identityId(5),
          type: 'MailAddress',
          value: 'archived@example.test',
          main: true,
        },
      ],
    },
    ...generatedUsers,
  ],
  clients: [
    {
      id: IDS.clientArchived,
      name: 'Archived Client',
      type: 'External',
      archivedAt: '2026-06-30T22:00:00.000Z',
    },
  ],
  projects: [
    {
      id: IDS.projectLarge,
      clientId: IDS.clientInternal,
      name: 'Large Project',
      description: 'Project with more than twenty people',
      archivedAt: null,
      ownerIds: [IDS.owner],
      memberIds: generatedUsers.map(({ id }) => id),
    },
    {
      id: IDS.projectArchived,
      clientId: IDS.clientArchived,
      name: 'Archived Project',
      description: 'Archived project description',
      archivedAt: '2026-06-30T22:00:00.000Z',
      ownerIds: [IDS.owner],
      memberIds: [IDS.archivedUser],
    },
  ],
  workUnits: [
    {
      id: IDS.worklogPrecise,
      userId: IDS.user,
      projectId: IDS.projectAlpha,
      entryType: 'Worklog',
      date: '2026-07-15',
      duration: 'PT7H59M36S',
      description: 'Precyzyjne godziny',
      taskId: null,
      state: 'Active',
      createdAt: '2026-07-15T08:00:00.000Z',
      modifiedAt: '2026-07-15T08:00:00.000Z',
    },
    {
      id: IDS.worklogHistorical,
      userId: IDS.archivedUser,
      projectId: IDS.projectArchived,
      entryType: 'Worklog',
      date: '2026-07-10',
      duration: 'PT30M',
      description: 'Historyczne godziny',
      taskId: null,
      state: 'Active',
      createdAt: '2026-07-10T08:00:00.000Z',
      modifiedAt: '2026-07-11T08:00:00.000Z',
    },
  ],
  failures: [],
  capabilities: [
    'multi-search:initial-selections',
    'projects:large-membership',
    'reports:archived',
    'reports:long-filters',
    'reports:precise-duration',
  ],
};
