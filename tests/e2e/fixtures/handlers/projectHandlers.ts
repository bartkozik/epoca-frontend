import type { ActorName, BuiltWorld } from '../../worlds';
import type { ProjectRole, WorldProject, WorldUser } from '../../worlds/types';
import type { MockHandler } from './types';

const AUDIT_DATE = '2026-01-01T00:00:00.000Z';

interface RawProjectUserFixture extends Record<string, unknown> {
  id: string;
  role: ProjectRole;
}

interface RawProjectFixture {
  archivedAt: string | null;
  client: {
    color: string;
    id: string;
    name: string;
    texture: string;
    type: 'Internal' | 'External';
  };
  createdAt: string;
  createdBy: string;
  description: string;
  id: string;
  modifiedAt: string;
  modifiedBy: string;
  name: string;
  organizationId: string;
  projectUsers: RawProjectUserFixture[];
  userCount: number;
  userIds: string[];
}

// PATCH returns the backend's flat Project domain object (ProjectRouter -> ProjectUpdateResult.
// Updated), not the list/get DTO shape RawProjectFixture models: clientId instead of a nested
// client, no projectUsers/userCount/userIds, plus archivedBy. Mirrors ProjectPatchResultSchema.
interface RawProjectPatchFixture {
  archivedAt: string | null;
  archivedBy: string | null;
  clientId: string;
  createdAt: string;
  createdBy: string;
  description: string;
  id: string;
  modifiedAt: string;
  modifiedBy: string;
  name: string;
  organizationId: string;
}

interface ProjectPayload {
  description: string;
  memberIds: string[];
  name: string;
  ownerIds: string[];
}

interface NewProjectPayload extends ProjectPayload {
  clientId: string;
}

const badRequest = (message: string): { status: 400; json: { message: string } } => ({
  status: 400,
  json: { message },
});

const requestRecord = (body: unknown): Record<string, unknown> | null =>
  body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;

const uniqueStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string')) return null;
  return new Set(value).size === value.length ? [...value] : null;
};

const projectPayload = (world: BuiltWorld, body: unknown): ProjectPayload | null => {
  const record = requestRecord(body);
  if (!record || typeof record.name !== 'string' || record.name.trim().length === 0) return null;
  if (typeof record.description !== 'string') return null;

  const ownerIds = uniqueStringArray(record.ownerIds);
  const memberIds = uniqueStringArray(record.memberIds);
  if (!ownerIds?.length || !memberIds) return null;
  if (ownerIds.some((id) => memberIds.includes(id))) return null;

  const userIds = new Set(world.users.map(({ id }) => id));
  if ([...ownerIds, ...memberIds].some((id) => !userIds.has(id))) return null;

  return {
    description: record.description,
    memberIds,
    name: record.name,
    ownerIds,
  };
};

const newProjectPayload = (world: BuiltWorld, body: unknown): NewProjectPayload | null => {
  const record = requestRecord(body);
  const payload = projectPayload(world, body);
  if (!record || !payload || typeof record.clientId !== 'string') return null;
  if (!world.clients.some(({ id }) => id === record.clientId)) return null;
  return { ...payload, clientId: record.clientId };
};

const nextProjectId = (world: BuiltWorld): string => {
  let sequence = world.projects.length + 100;
  let candidate = '';
  do {
    candidate = `40000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;
    sequence += 1;
  } while (world.allIds.includes(candidate));
  return candidate;
};

const projectIndexFromPath = (world: BuiltWorld, path: string, offset = 1): number => {
  const projectId = path.split('/').at(-offset);
  return world.projects.findIndex(({ id }) => id === projectId);
};

const userAndProjectIds = (path: string): { projectId: string; userId: string } => {
  const parts = path.split('/');
  return { projectId: parts.at(-3) ?? '', userId: parts.at(-1) ?? '' };
};

const bulkFilter = (
  world: BuiltWorld,
  body: unknown
): { clientId?: string; clientType?: 'Internal' | 'External' } | null => {
  const record = requestRecord(body);
  if (!record) return null;
  const clientId = record.clientId;
  const clientType = record.clientType;
  if (clientId !== undefined && typeof clientId !== 'string') return null;
  if (clientType !== undefined && clientType !== 'Internal' && clientType !== 'External') return null;
  if (typeof clientId === 'string' && !world.clients.some(({ id }) => id === clientId)) return null;
  return {
    ...(typeof clientId === 'string' ? { clientId } : {}),
    ...(clientType === 'Internal' || clientType === 'External' ? { clientType } : {}),
  };
};

const selectedBulkProjectIds = (world: BuiltWorld, filter: NonNullable<ReturnType<typeof bulkFilter>>): Set<string> => {
  const matchingClientIds = new Set(
    world.clients
      .filter(
        ({ id, type }) =>
          (!filter.clientId || id === filter.clientId) && (!filter.clientType || type === filter.clientType)
      )
      .map(({ id }) => id)
  );
  return new Set(
    world.projects
      .filter(({ archivedAt, clientId }) => archivedAt === null && matchingClientIds.has(clientId))
      .map(({ id }) => id)
  );
};

const rawProjectUser = (
  world: BuiltWorld,
  user: WorldUser,
  role: ProjectRole,
  loggedInUserId: string | null
): RawProjectUserFixture => {
  const actor = (Object.entries(world.actors) as [ActorName, (typeof world.actors)[ActorName]][]).find(
    ([, candidate]) => candidate?.userId === user.id
  )?.[1];

  return {
    archived: user.archived,
    archivedAt: user.archived ? AUDIT_DATE : '',
    avatar: '',
    color: '',
    createdAt: AUDIT_DATE,
    displayedName: `${user.firstName} ${user.lastName}`,
    email: user.email,
    firstName: user.firstName,
    fullName: `${user.firstName} ${user.lastName}`,
    id: user.id,
    identities: user.identities.map((identity) => ({
      ...identity,
      confirmationCode: null,
      confirmed: true,
      createdAt: AUDIT_DATE,
      deviceId: null,
      userId: user.id,
    })),
    isLoggedInUser: user.id === loggedInUserId,
    isSuperAdmin: false,
    lastName: user.lastName,
    modifiedAt: AUDIT_DATE,
    organizationRoles: actor?.organizationRoles ?? user.organizationRoles,
    projects: [],
    role,
  };
};

export const toRawProject = (world: BuiltWorld, project: WorldProject, actorName: ActorName): RawProjectFixture => {
  const client = world.clients.find(({ id }) => id === project.clientId);
  if (!client) throw new Error(`Project ${project.id} has no client ${project.clientId}`);
  const loggedInUserId = actorName === 'anonymous' ? null : world.actors[actorName]?.userId ?? null;

  const roles = new Map<string, ProjectRole>([
    ...project.ownerIds.map((id) => [id, 'Owner'] as const),
    ...project.memberIds.map((id) => [id, 'Member'] as const),
  ]);
  const projectUsers = [...roles].map(([userId, role]) => {
    const user = world.users.find(({ id }) => id === userId);
    if (!user) throw new Error(`Project ${project.id} has no user ${userId}`);
    return rawProjectUser(world, user, role, loggedInUserId);
  });

  return {
    archivedAt: project.archivedAt,
    client: {
      color: client.color ?? '',
      id: client.id,
      name: client.name,
      texture: client.texture ?? '',
      type: client.type,
    },
    createdAt: AUDIT_DATE,
    createdBy: project.ownerIds[0] ?? 'e2e-system',
    description: project.description,
    id: project.id,
    modifiedAt: AUDIT_DATE,
    modifiedBy: project.ownerIds[0] ?? 'e2e-system',
    name: project.name,
    organizationId: world.organization?.id ?? '',
    projectUsers,
    userCount: projectUsers.length,
    userIds: [...roles.keys()],
  };
};

const toRawProjectPatchResult = (world: BuiltWorld, project: WorldProject): RawProjectPatchFixture => ({
  archivedAt: project.archivedAt,
  archivedBy: project.archivedAt ? project.ownerIds[0] ?? 'e2e-system' : null,
  clientId: project.clientId,
  createdAt: AUDIT_DATE,
  createdBy: project.ownerIds[0] ?? 'e2e-system',
  description: project.description,
  id: project.id,
  modifiedAt: AUDIT_DATE,
  modifiedBy: project.ownerIds[0] ?? 'e2e-system',
  name: project.name,
  organizationId: world.organization?.id ?? '',
});

export const projectHandlers: MockHandler[] = [
  {
    id: 'projects-list',
    method: 'GET',
    path: /^\/organizations\/epoca-e2e\/projects$/,
    handle: (request, runtime) => {
      const clientId = request.query.clientId?.at(-1);
      const includeArchived = request.query.includeArchived?.includes('true') ?? false;
      const includeArchivedConnections = request.query.includeArchivedConnections?.includes('true') ?? false;
      const archivedClientIds = new Set(
        runtime.state.clients.filter(({ archivedAt }) => archivedAt !== null).map(({ id }) => id)
      );
      const results = runtime.state.projects
        .filter((project) => !clientId || project.clientId === clientId)
        .filter(({ archivedAt }) => includeArchived || archivedAt === null)
        .filter(
          ({ clientId: projectClientId }) => includeArchivedConnections || !archivedClientIds.has(projectClientId)
        )
        .map((project) => toRawProject(runtime.state, project, runtime.actor));
      return { status: 200, json: { count: results.length, results } };
    },
  },
  {
    id: 'project-by-id',
    method: 'GET',
    path: /^\/organizations\/epoca-e2e\/projects\/[^/]+$/,
    handle: (request, runtime) => {
      const projectId = request.path.split('/').at(-1);
      const project = runtime.state.projects.find(({ id }) => id === projectId);
      return project
        ? { status: 200, json: toRawProject(runtime.state, project, runtime.actor) }
        : { status: 404, json: { message: 'Project not found' } };
    },
  },
  {
    id: 'project-create',
    method: 'POST',
    path: /^\/organizations\/epoca-e2e\/projects$/,
    handle: (request, runtime) => {
      const payload = newProjectPayload(runtime.state, request.body);
      if (!payload) return badRequest('Invalid project payload');

      const project: WorldProject = {
        ...payload,
        id: nextProjectId(runtime.state),
        archivedAt: null,
      };
      runtime.state.projects = [...runtime.state.projects, project];
      runtime.state.allIds = [...runtime.state.allIds, project.id];
      return { status: 201, json: toRawProject(runtime.state, project, runtime.actor) };
    },
  },
  {
    id: 'project-update',
    method: 'PATCH',
    path: /^\/organizations\/epoca-e2e\/projects\/[^/]+$/,
    handle: (request, runtime) => {
      const projectIndex = projectIndexFromPath(runtime.state, request.path);
      if (projectIndex < 0) return { status: 404, json: { message: 'Project not found' } };
      const payload = projectPayload(runtime.state, request.body);
      if (!payload) return badRequest('Invalid project payload');

      const updatedProject: WorldProject = { ...runtime.state.projects[projectIndex], ...payload };
      runtime.state.projects = runtime.state.projects.map((project, index) =>
        index === projectIndex ? updatedProject : project
      );
      return { status: 200, json: toRawProjectPatchResult(runtime.state, updatedProject) };
    },
  },
  {
    id: 'project-archive',
    method: 'DELETE',
    path: /^\/organizations\/epoca-e2e\/projects\/[^/]+$/,
    handle: (request, runtime) => {
      const projectIndex = projectIndexFromPath(runtime.state, request.path);
      if (projectIndex < 0) return { status: 404, json: { message: 'Project not found' } };
      const archivedProject: WorldProject = {
        ...runtime.state.projects[projectIndex],
        archivedAt: new Date(runtime.state.clock).toISOString(),
      };
      runtime.state.projects = runtime.state.projects.map((project, index) =>
        index === projectIndex ? archivedProject : project
      );
      return { status: 204 };
    },
  },
  {
    id: 'project-unarchive',
    method: 'POST',
    path: /^\/organizations\/epoca-e2e\/projects\/[^/]+\/unarchive$/,
    handle: (request, runtime) => {
      const projectIndex = projectIndexFromPath(runtime.state, request.path, 2);
      if (projectIndex < 0) return { status: 404, json: { message: 'Project not found' } };
      const activeProject: WorldProject = { ...runtime.state.projects[projectIndex], archivedAt: null };
      runtime.state.projects = runtime.state.projects.map((project, index) =>
        index === projectIndex ? activeProject : project
      );
      return { status: 204 };
    },
  },
  {
    id: 'project-user-add',
    method: 'POST',
    path: /^\/organizations\/epoca-e2e\/projects\/(?!all\/)[^/]+\/users\/[^/]+$/,
    handle: (request, runtime) => {
      const { projectId, userId } = userAndProjectIds(request.path);
      const projectIndex = runtime.state.projects.findIndex(({ id }) => id === projectId);
      if (projectIndex < 0) return { status: 404, json: { message: 'Project not found' } };
      if (!runtime.state.users.some(({ id }) => id === userId)) {
        return { status: 404, json: { message: 'User not found' } };
      }
      const record = requestRecord(request.body);
      if (record?.role !== 'Owner' && record?.role !== 'Member') return badRequest('Invalid project role');

      const project = runtime.state.projects[projectIndex];
      const updatedProject: WorldProject = {
        ...project,
        ownerIds:
          record.role === 'Owner'
            ? [...new Set([...project.ownerIds, userId])]
            : project.ownerIds.filter((id) => id !== userId),
        memberIds:
          record.role === 'Member'
            ? [...new Set([...project.memberIds, userId])]
            : project.memberIds.filter((id) => id !== userId),
      };
      if (updatedProject.ownerIds.length === 0) return badRequest('Project must have at least one owner');
      runtime.state.projects = runtime.state.projects.map((candidate, index) =>
        index === projectIndex ? updatedProject : candidate
      );
      return { status: 204 };
    },
  },
  {
    id: 'project-user-remove',
    method: 'DELETE',
    path: /^\/organizations\/epoca-e2e\/projects\/(?!all\/)[^/]+\/users\/[^/]+$/,
    handle: (request, runtime) => {
      const { projectId, userId } = userAndProjectIds(request.path);
      const projectIndex = runtime.state.projects.findIndex(({ id }) => id === projectId);
      if (projectIndex < 0) return { status: 404, json: { message: 'Project not found' } };
      if (!runtime.state.users.some(({ id }) => id === userId)) {
        return { status: 404, json: { message: 'User not found' } };
      }

      const project = runtime.state.projects[projectIndex];
      const updatedProject: WorldProject = {
        ...project,
        ownerIds: project.ownerIds.filter((id) => id !== userId),
        memberIds: project.memberIds.filter((id) => id !== userId),
      };
      if (updatedProject.ownerIds.length === 0) return badRequest('Project must have at least one owner');
      runtime.state.projects = runtime.state.projects.map((candidate, index) =>
        index === projectIndex ? updatedProject : candidate
      );
      return { status: 204 };
    },
  },
  {
    id: 'projects-user-bulk-add',
    method: 'POST',
    path: /^\/organizations\/epoca-e2e\/projects\/all\/users\/[^/]+$/,
    handle: (request, runtime) => {
      const userId = request.path.split('/').at(-1) ?? '';
      if (!runtime.state.users.some(({ id }) => id === userId)) {
        return { status: 404, json: { message: 'User not found' } };
      }
      const filter = bulkFilter(runtime.state, request.body);
      if (!filter) return badRequest('Invalid project filter');
      const projectIds = selectedBulkProjectIds(runtime.state, filter);
      const changedProjectIds: string[] = [];
      runtime.state.projects = runtime.state.projects.map((project) => {
        if (!projectIds.has(project.id) || project.ownerIds.includes(userId) || project.memberIds.includes(userId)) {
          return project;
        }
        changedProjectIds.push(project.id);
        return { ...project, memberIds: [...project.memberIds, userId] };
      });
      return { status: 200, json: { changedProjectIds } };
    },
  },
  {
    id: 'projects-user-bulk-remove',
    method: 'PATCH',
    path: /^\/organizations\/epoca-e2e\/projects\/all\/users\/[^/]+$/,
    handle: (request, runtime) => {
      const userId = request.path.split('/').at(-1) ?? '';
      if (!runtime.state.users.some(({ id }) => id === userId)) {
        return { status: 404, json: { message: 'User not found' } };
      }
      const filter = bulkFilter(runtime.state, request.body);
      if (!filter) return badRequest('Invalid project filter');
      const projectIds = selectedBulkProjectIds(runtime.state, filter);
      const changedProjectIds: string[] = [];
      const candidateProjects = runtime.state.projects.map((project) => {
        if (
          !projectIds.has(project.id) ||
          (!project.ownerIds.includes(userId) && !project.memberIds.includes(userId))
        ) {
          return project;
        }
        changedProjectIds.push(project.id);
        return {
          ...project,
          memberIds: project.memberIds.filter((id) => id !== userId),
          ownerIds: project.ownerIds.filter((id) => id !== userId),
        };
      });
      const removesLastOwner = runtime.state.projects.some(
        (project, index) =>
          projectIds.has(project.id) &&
          project.ownerIds.includes(userId) &&
          candidateProjects[index].ownerIds.length === 0
      );
      if (removesLastOwner) return badRequest('Project must have at least one owner');
      runtime.state.projects = candidateProjects;
      return { status: 200, json: { changedProjectIds } };
    },
  },
];
