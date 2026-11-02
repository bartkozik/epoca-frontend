import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildWorldFromRegistry, type WorldRegistry } from './buildWorld';
import { IDS } from './ids';
import { buildWorld, WORLD_NAMES } from './index';
import { normalizeWorld } from './normalizeWorld';
import type { BuiltWorld, WorldDefinition } from './types';

const findEntity = (world: BuiltWorld, id: string): unknown => {
  if (world.organization?.id === id) return world.organization;

  for (const collection of [world.users, world.clients, world.projects, world.workUnits]) {
    const entity = collection.find((candidate) => candidate.id === id);
    if (entity) return entity;
  }

  for (const user of world.users) {
    const identity = user.identities.find((candidate) => candidate.id === id);
    if (identity) return identity;
  }

  throw new Error(`Entity ${id} does not exist in ${world.name}`);
};

const baseInvalidDefinition = (): WorldDefinition => ({
  name: 'world-1',
  parent: null,
  clock: '2026-07-15T10:00:00.000+02:00',
  locale: 'pl-PL',
  timeZone: 'Europe/Warsaw',
  organization: {
    id: IDS.organization,
    slug: 'invalid-world-test',
    name: 'Invalid world test',
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
          id: '60000000-0000-4000-8000-000000000001',
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
  capabilities: [],
});

const buildInvalidWorld = ({
  duplicateId,
  missingProjectId,
}: {
  duplicateId?: string;
  missingProjectId?: string;
}): BuiltWorld => {
  const definition = baseInvalidDefinition();

  if (duplicateId) {
    definition.users.push({
      id: duplicateId,
      email: 'duplicate@example.test',
      firstName: 'Duplicate',
      lastName: 'User',
      organizationRoles: ['Employee'],
      archived: false,
      identities: [
        {
          id: '60000000-0000-4000-8000-000000000099',
          type: 'MailAddress',
          value: 'duplicate@example.test',
          main: true,
        },
      ],
    });
  }

  if (missingProjectId) {
    definition.workUnits.push({
      id: IDS.worklogPrecise,
      userId: IDS.owner,
      projectId: missingProjectId,
      entryType: 'Worklog',
      date: '2026-07-15',
      duration: 'PT1H',
      description: 'Dangling project reference',
      taskId: null,
      state: 'Active',
      createdAt: '2026-07-15T08:00:00.000Z',
      modifiedAt: '2026-07-15T08:00:00.000Z',
    });
  }

  const registry: WorldRegistry = { 'world-1': definition };
  return buildWorldFromRegistry('world-1', registry);
};

test.describe('world contracts @mr @technical', () => {
  test('world-6 owns only public OAuth client metadata @oauth-client', () => {
    expect(WORLD_NAMES).toContain('world-6');
    const world = buildWorld('world-6') as BuiltWorld & {
      oauthIntegration?: {
        clients: Array<{ status: string }>;
        staleVersion: { attemptedVersion: number; currentVersion: number };
      };
    };
    const serialized = JSON.stringify(world.oauthIntegration);

    expect(world.oauthIntegration?.clients.map(({ status }) => status)).toEqual(['Active', 'Expired', 'Revoked']);
    expect(world.oauthIntegration?.staleVersion).toMatchObject({ attemptedVersion: 4, currentVersion: 5 });
    expect(serialized).not.toMatch(/clientSecret|secretHash|accessToken|authorization/i);
  });

  for (const name of WORLD_NAMES) {
    test(`${name} is immutable and snapshot-stable`, () => {
      const world = buildWorld(name);
      expect(Object.isFrozen(world)).toBe(true);
      expect(Object.isFrozen(world.users)).toBe(true);
      expect(Object.isFrozen(world.users[0] ?? world)).toBe(true);
      expect(new Set(world.allIds).size).toBe(world.allIds.length);
      const normalized = `${JSON.stringify(normalizeWorld(world), null, 2)}\n`;
      const contractPath = path.join(__dirname, 'contracts', `${name}.json`);
      if (process.env.UPDATE_E2E_WORLD_CONTRACTS === 'true') {
        writeFileSync(contractPath, normalized, 'utf8');
      }
      expect(readFileSync(contractPath, 'utf8')).toBe(normalized);
    });
  }

  test('each world preserves the IDs and entities of its parent', () => {
    for (let index = 1; index < WORLD_NAMES.length; index += 1) {
      const parent = buildWorld(WORLD_NAMES[index - 1]);
      const child = buildWorld(WORLD_NAMES[index]);
      expect(child.allIds).toEqual(expect.arrayContaining([...parent.allIds]));
      for (const id of parent.allIds) {
        expect(findEntity(child, id)).toEqual(findEntity(parent, id));
      }
    }
  });

  test('rejects unknown worlds duplicates and dangling references', () => {
    expect(() => buildWorld('world-unknown' as never)).toThrow(/unknown world/i);
    expect(() => buildInvalidWorld({ duplicateId: IDS.owner })).toThrow(/duplicate/i);
    expect(() => buildInvalidWorld({ missingProjectId: IDS.projectAlpha })).toThrow(/reference/i);
  });

  test('nested entities cannot be mutated', () => {
    const world = buildWorld('world-4');
    expect(() => (world.users[0].identities as unknown as unknown[]).push({})).toThrow();
    expect(() => world.projects[0].memberIds.push('mutated')).toThrow();
  });

  test('does not share or freeze references from registry definitions', () => {
    const definition = baseInvalidDefinition();
    const sourceOrganization = definition.organization;
    const sourceActor = definition.actors.owner;
    const sourceUser = definition.users[0];
    const sourceIdentity = sourceUser.identities[0];
    const registry: WorldRegistry = { 'world-1': definition };

    const world = buildWorldFromRegistry('world-1', registry);

    expect(world.organization).not.toBe(sourceOrganization);
    expect(world.actors.owner).not.toBe(sourceActor);
    expect(world.users[0]).not.toBe(sourceUser);
    expect(world.users[0].identities[0]).not.toBe(sourceIdentity);
    expect(Object.isFrozen(sourceOrganization)).toBe(false);
    expect(Object.isFrozen(sourceActor)).toBe(false);
    expect(Object.isFrozen(sourceUser)).toBe(false);
    expect(Object.isFrozen(sourceIdentity)).toBe(false);

    sourceUser.firstName = 'Changed after build';
    sourceIdentity.value = 'changed@example.test';
    expect(world.users[0].firstName).toBe('Owner');
    expect(world.users[0].identities[0].value).toBe('owner@example.test');
  });

  test('deep-freezes nested values from shallow-frozen input', () => {
    const definition = baseInvalidDefinition();
    const sourceUser = definition.users[0];
    const sourceIdentities = sourceUser.identities;
    Object.freeze(sourceUser);

    const world = buildWorldFromRegistry('world-1', { 'world-1': definition });

    expect(Object.isFrozen(world.users[0])).toBe(true);
    expect(Object.isFrozen(world.users[0].identities)).toBe(true);
    expect(() => (world.users[0].identities as unknown as unknown[]).push({})).toThrow();
    expect(Object.isFrozen(sourceIdentities)).toBe(false);
  });

  test('keeps users separate from actors and preserves canonical edge-case data', () => {
    const world4 = buildWorld('world-4');
    const generatedUsers = world4.users.filter(({ email }) => email.startsWith('person'));
    const preciseWorklog = world4.workUnits.find(({ id }) => id === IDS.worklogPrecise);

    expect(generatedUsers).toHaveLength(21);
    expect(generatedUsers.map(({ id }) => id)).toEqual(
      Array.from({ length: 21 }, (_, index) => `20000000-0000-4000-8000-${(index + 6).toString().padStart(12, '0')}`)
    );
    expect(generatedUsers.map(({ email }) => email)).toEqual(
      Array.from({ length: 21 }, (_, index) => `person${(index + 6).toString().padStart(2, '0')}@example.test`)
    );
    const actorUserIds = new Set(Object.values(world4.actors).map(({ userId }) => userId));
    const generatedActorIntersection = generatedUsers.map(({ id }) => id).filter((id) => actorUserIds.has(id));
    expect(actorUserIds.has(IDS.archivedUser)).toBe(false);
    expect(generatedActorIntersection).toEqual([]);
    expect(preciseWorklog).toMatchObject({
      duration: 'PT7H59M36S',
      description: 'Precyzyjne godziny',
    });

    const world5 = buildWorld('world-5');
    expect(world5.workUnits.find(({ id }) => id === IDS.notePast)).toMatchObject({
      entryType: 'Note',
      duration: 'PT2H',
    });
    expect(world5.workUnits.find(({ id }) => id === IDS.noteFuture)).toMatchObject({
      entryType: 'Note',
      duration: 'PT3H',
    });
    expect(world5.workUnits.find(({ id }) => id === IDS.worklogTaskIds)?.taskId).toBe('CT-513, CT-426');
  });
});
