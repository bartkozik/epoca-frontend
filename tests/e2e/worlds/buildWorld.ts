import type { ActorName, BuiltWorld, WorldDefinition, WorldName, WorldUser } from './types';

export type WorldRegistry = Partial<Record<WorldName, WorldDefinition>>;

const deepFreeze = <Value>(value: Value): Value => {
  if (value === null || typeof value !== 'object') return value;

  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
};

const equalArrays = <Value>(left: readonly Value[], right: readonly Value[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const entityIds = (world: WorldDefinition): string[] => [
  ...(world.organization ? [world.organization.id] : []),
  ...world.users.flatMap((user) => [user.id, ...user.identities.map(({ id }) => id)]),
  ...world.clients.map(({ id }) => id),
  ...world.projects.map(({ id }) => id),
  ...world.workUnits.map(({ id }) => id),
  ...(world.oauthIntegration?.clients.flatMap(({ clientId, serviceAccount }) => [clientId, serviceAccount.userId]) ?? []),
  ...(world.oauthIntegration?.auditEvents.map(({ id }) => id) ?? []),
];

const validateUniqueIds = (ids: readonly string[]): void => {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Duplicate entity ID: ${id}`);
    seen.add(id);
  }
};

const validateActor = (
  actorName: ActorName,
  actor: NonNullable<WorldDefinition['actors'][ActorName]>,
  usersById: ReadonlyMap<string, WorldUser>,
  projectsById: ReadonlyMap<string, WorldDefinition['projects'][number]>
): void => {
  const user = usersById.get(actor.userId);
  if (!user) throw new Error(`Invalid reference from actor ${actorName} to user ${actor.userId}`);

  if (
    actor.email !== user.email ||
    actor.firstName !== user.firstName ||
    actor.lastName !== user.lastName ||
    actor.archived !== user.archived ||
    !equalArrays(actor.organizationRoles, user.organizationRoles)
  ) {
    throw new Error(`Actor ${actorName} does not match referenced user ${actor.userId}`);
  }

  for (const [projectId, role] of Object.entries(actor.projectRoles)) {
    const project = projectsById.get(projectId);
    if (!project) {
      throw new Error(`Invalid reference from actor ${actorName} to project ${projectId}`);
    }
    const roleIds = role === 'Owner' ? project.ownerIds : project.memberIds;
    if (!roleIds.includes(actor.userId)) {
      throw new Error(`Actor ${actorName} has an inconsistent ${role} project role`);
    }
  }
};

const validateReferences = (world: WorldDefinition): void => {
  const usersById = new Map(world.users.map((user) => [user.id, user]));
  const clientsById = new Map(world.clients.map((client) => [client.id, client]));
  const projectsById = new Map(world.projects.map((project) => [project.id, project]));

  for (const [actorName, actor] of Object.entries(world.actors) as [
    ActorName,
    NonNullable<WorldDefinition['actors'][ActorName]>
  ][]) {
    validateActor(actorName, actor, usersById, projectsById);
  }

  for (const project of world.projects) {
    if (!clientsById.has(project.clientId)) {
      throw new Error(`Invalid reference from project ${project.id} to client ${project.clientId}`);
    }
    for (const userId of [...project.ownerIds, ...project.memberIds]) {
      if (!usersById.has(userId)) {
        throw new Error(`Invalid reference from project ${project.id} to user ${userId}`);
      }
    }
  }

  for (const workUnit of world.workUnits) {
    if (!usersById.has(workUnit.userId)) {
      throw new Error(`Invalid reference from work unit ${workUnit.id} to user ${workUnit.userId}`);
    }
    if (!projectsById.has(workUnit.projectId)) {
      throw new Error(`Invalid reference from work unit ${workUnit.id} to project ${workUnit.projectId}`);
    }
  }

  for (const client of world.oauthIntegration?.clients ?? []) {
    if (
      client.projectAccess.mode === 'SelectedProjects' &&
      client.projectAccess.projectIds.some((projectId) => !projectsById.has(projectId))
    ) {
      throw new Error(`Invalid project reference from integration client ${client.clientId}`);
    }
  }
  if (
    world.oauthIntegration &&
    !world.oauthIntegration.clients.some(({ clientId }) => clientId === world.oauthIntegration?.staleVersion.clientId)
  ) {
    throw new Error('Invalid stale-version integration client reference');
  }
};

const mergeDefinition = (definition: WorldDefinition, parent: BuiltWorld | null): WorldDefinition => ({
  name: definition.name,
  parent: definition.parent,
  clock: definition.clock,
  locale: definition.locale,
  timeZone: definition.timeZone,
  organization: definition.organization ?? parent?.organization ?? null,
  actors: { ...(parent?.actors ?? {}), ...definition.actors },
  users: [...(parent?.users ?? []), ...definition.users],
  clients: [...(parent?.clients ?? []), ...definition.clients],
  projects: [...(parent?.projects ?? []), ...definition.projects],
  workUnits: [...(parent?.workUnits ?? []), ...definition.workUnits],
  oauthIntegration: definition.oauthIntegration ?? parent?.oauthIntegration,
  failures: [...(parent?.failures ?? []), ...definition.failures],
  capabilities: [...(parent?.capabilities ?? []), ...definition.capabilities],
});

const build = (name: WorldName, registry: WorldRegistry, ancestors: ReadonlySet<WorldName>): BuiltWorld => {
  const definition = registry[name];
  if (!definition) throw new Error(`Unknown world: ${name}`);
  if (definition.name !== name) throw new Error(`World registry key does not match ${definition.name}`);
  if (ancestors.has(name)) throw new Error(`World parent cycle includes ${name}`);

  const nextAncestors = new Set(ancestors).add(name);
  const parent = definition.parent ? build(definition.parent, registry, nextAncestors) : null;
  const merged = structuredClone(mergeDefinition(definition, parent));
  const allIds = entityIds(merged);

  validateUniqueIds(allIds);
  validateReferences(merged);

  return deepFreeze({ ...merged, allIds });
};

export const buildWorldFromRegistry = (name: WorldName, registry: WorldRegistry): BuiltWorld =>
  build(name, registry, new Set());
