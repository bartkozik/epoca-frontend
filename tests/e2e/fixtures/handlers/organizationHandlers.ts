import type { ActorName, BuiltWorld } from '../../worlds';
import type { WorldUser } from '../../worlds/types';
import type { MockHandler } from './types';

const AUDIT_DATE = '2026-01-01T00:00:00.000Z';

interface RawOrganizationUserFixture {
  avatar: string | null;
  firstName: string;
  id: string;
  identities: Array<{
    id: string;
    type: 'MailAddress';
    value: string;
    main: boolean;
    deviceId: null;
  }>;
  lastName: string;
  organizationRoles: readonly string[];
  archived: boolean;
}

interface RawOrganizationFixture {
  id: string;
  slug: string;
  name: string;
  archivedAt: null;
  createdAt: string;
  createdBy: (RawOrganizationUserFixture & Record<string, unknown>) | null;
  modifiedAt: string;
  modifiedBy: (RawOrganizationUserFixture & Record<string, unknown>) | null;
}

const firstActorUser = (world: BuiltWorld): WorldUser | undefined => {
  const actorIds = new Set(Object.values(world.actors).map((actor) => actor?.userId));
  return world.users.find(({ id }) => actorIds.has(id)) ?? world.users[0];
};

const rawUser = (world: BuiltWorld, user: WorldUser): RawOrganizationUserFixture => {
  const actor = (Object.entries(world.actors) as [ActorName, (typeof world.actors)[ActorName]][]).find(
    ([, candidate]) => candidate?.userId === user.id,
  )?.[1];

  return {
    avatar: user.avatar ?? null,
    firstName: user.firstName,
    id: user.id,
    identities: user.identities.map((identity) => ({ ...identity, deviceId: null })),
    lastName: user.lastName,
    organizationRoles: actor?.organizationRoles ?? user.organizationRoles,
    archived: user.archived,
  };
};

export const toRawOrganization = (world: BuiltWorld): RawOrganizationFixture | null => {
  if (!world.organization) return null;
  const user = firstActorUser(world);
  const createdBy = user
    ? {
        ...rawUser(world, user),
        archivedAt: '',
        avatar: '',
        color: '',
        createdAt: AUDIT_DATE,
        isSuperAdmin: false,
        modifiedAt: AUDIT_DATE,
      }
    : null;

  return {
    ...world.organization,
    archivedAt: null,
    createdAt: AUDIT_DATE,
    createdBy,
    modifiedAt: AUDIT_DATE,
    modifiedBy: createdBy,
  };
};

export const organizationHandlers: MockHandler[] = [
  {
    id: 'organizations-list',
    method: 'GET',
    path: /^\/organizations$/,
    handle: (request, runtime) => {
      const organization = toRawOrganization(runtime.state);
      const requestedIds = request.query.id;
      const results = organization && (!requestedIds || requestedIds.includes(organization.id)) ? [organization] : [];
      return { status: 200, json: { count: results.length, results } };
    },
  },
  {
    id: 'organization-by-slug',
    method: 'GET',
    path: /^\/organizations\/epoca-e2e$/,
    handle: (_request, runtime) => {
      const organization = toRawOrganization(runtime.state);
      return organization
        ? { status: 200, json: organization }
        : { status: 404, json: { message: 'Organization not found' } };
    },
  },
  {
    id: 'organization-users',
    method: 'GET',
    path: /^\/organizations\/epoca-e2e\/users$/,
    // Workspace lists ask with includeArchived=true; reports also add includeArchivedMembers=true. The e2e
    // world has no archived memberships, so both get the same list. Any other query is a test bug.
    handle: (request, runtime) => {
      const { includeArchived, includeArchivedMembers, ...unexpected } = request.query;
      const isTrue = (values: readonly string[] | undefined): boolean => values?.length === 1 && values[0] === 'true';
      if (
        !isTrue(includeArchived) ||
        (includeArchivedMembers !== undefined && !isTrue(includeArchivedMembers)) ||
        Object.keys(unexpected).length > 0
      ) {
        throw new Error(`Unexpected organization users query: ${JSON.stringify(request.query)}`);
      }
      return { status: 200, json: runtime.state.users.map((user) => rawUser(runtime.state, user)) };
    },
  },
  {
    id: 'organization-user-project-details',
    method: 'GET',
    path: /^\/organizations\/epoca-e2e\/users\/[^/]+\/details$/,
    handle: (request, runtime) => {
      const actor = runtime.actor === 'anonymous' ? undefined : runtime.state.actors[runtime.actor];
      const canReadDetails = actor?.organizationRoles.some((role) => role === 'Owner' || role === 'Manager') ?? false;
      if (!canReadDetails) return { status: 403, json: { message: 'Forbidden' } };

      const userId = request.path.split('/').at(-2);
      const user = runtime.state.users.find(({ id }) => id === userId);
      if (!user) return { status: 404, json: { message: 'User not found' } };

      const results = runtime.state.projects
        .filter(({ memberIds, ownerIds }) => memberIds.includes(user.id) || ownerIds.includes(user.id))
        .map((project) => {
          const client = runtime.state.clients.find(({ id }) => id === project.clientId);
          if (!client) throw new Error(`Project ${project.id} has no client ${project.clientId}`);
          return {
            clientId: client.id,
            clientName: client.name,
            projectId: project.id,
            projectName: project.name,
            role: user.organizationRoles[0],
          };
        });

      return { status: 200, json: results };
    },
  },
];
