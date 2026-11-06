import type { ActorName, BuiltWorld, WorldProject, WorldUser } from './types';

const byId = <Entity extends { id: string }>(left: Entity, right: Entity): number =>
  left.id.localeCompare(right.id, 'en');

const normalizeUser = (user: WorldUser): WorldUser => ({
  ...user,
  organizationRoles: [...user.organizationRoles].sort(),
  identities: [...user.identities].sort(byId),
});

const normalizeProject = (project: WorldProject): WorldProject => ({
  ...project,
  ownerIds: [...project.ownerIds].sort(),
  memberIds: [...project.memberIds].sort(),
});

export const normalizeWorld = (world: BuiltWorld): unknown => {
  const actors = Object.fromEntries(
    (Object.entries(world.actors) as [ActorName, NonNullable<BuiltWorld['actors'][ActorName]>][])
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([name, actor]) => [
        name,
        {
          ...actor,
          organizationRoles: [...actor.organizationRoles].sort(),
          projectRoles: Object.fromEntries(
            Object.entries(actor.projectRoles).sort(([left], [right]) => left.localeCompare(right, 'en'))
          ),
        },
      ])
  );

  return {
    ...world,
    actors,
    users: [...world.users].sort(byId).map(normalizeUser),
    clients: [...world.clients].sort(byId).map((client) => ({ texture: '', color: '', logo: '', ...client })),
    projects: [...world.projects].sort(byId).map(normalizeProject),
    workUnits: [...world.workUnits].sort(byId),
    ...(world.oauthIntegration
      ? {
          oauthIntegration: {
            ...world.oauthIntegration,
            clients: [...world.oauthIntegration.clients].sort(({ clientId: left }, { clientId: right }) =>
              left.localeCompare(right, 'en')
            ),
            auditEvents: [...world.oauthIntegration.auditEvents].sort(byId),
          },
        }
      : {}),
    failures: [...world.failures].sort(({ key: left }, { key: right }) => left.localeCompare(right, 'en')),
    capabilities: [...world.capabilities].sort(),
    allIds: [...world.allIds].sort(),
  };
};
