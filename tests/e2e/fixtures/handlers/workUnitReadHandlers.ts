import type { BuiltWorld } from '../../worlds';
import type { WorldWorkUnit } from '../../worlds/types';
import type { MockHandler } from './types';

export type RawWorkUnitFixture = WorldWorkUnit & {
  projectClient: {
    clientColor: string;
    clientId: string;
    clientName: string;
    clientTexture: string;
    projectDescription: string;
    projectId: string;
    projectName: string;
  };
  effectiveProjectClient: RawWorkUnitFixture["projectClient"];
  effectiveTaskId: string | null;
  revision: number;
  userFullName: string;
};

export const toRawWorkUnit = (world: BuiltWorld, workUnit: WorldWorkUnit): RawWorkUnitFixture => {
  const project = world.projects.find(({ id }) => id === workUnit.projectId);
  const client = project && world.clients.find(({ id }) => id === project.clientId);
  const user = world.users.find(({ id }) => id === workUnit.userId);
  if (!project || !client) throw new Error(`Work unit ${workUnit.id} has incomplete project data`);
  if (!user) throw new Error(`Work unit ${workUnit.id} has no user ${workUnit.userId}`);

  const projectClient = {
      clientColor: client.color ?? '',
      clientId: client.id,
      clientName: client.name,
      clientTexture: client.texture ?? '',
      projectDescription: project.description,
      projectId: project.id,
      projectName: project.name,
  };
  return {
    ...workUnit,
    projectClient,
    effectiveProjectClient: { ...projectClient },
    effectiveTaskId: workUnit.taskId,
    revision: 0,
    userFullName: `${user.firstName} ${user.lastName}`,
  };
};

const matchesRepeatedFilter = (values: readonly string[] | undefined, candidate: string): boolean =>
  !values || values.includes(candidate);

const hasValidBooleanQuery = (values: readonly string[] | undefined): boolean =>
  !values || values.every((value) => value === 'true' || value === 'false');

export const workUnitReadHandlers: MockHandler[] = [
  {
    id: 'work-units-list',
    method: 'GET',
    path: /^\/organizations\/epoca-e2e\/work-units$/,
    handle: (request, runtime) => {
      if (
        !hasValidBooleanQuery(request.query.includeArchived) ||
        !hasValidBooleanQuery(request.query.shouldReturnDraftIds)
      ) {
        return { status: 400, json: { message: 'Invalid boolean work-unit query' } };
      }

      const dateFrom = request.query.dateFrom?.at(-1);
      const dateTo = request.query.dateTo?.at(-1);
      const includeArchived = request.query.includeArchived?.at(-1) === 'true';
      const shouldReturnDraftIds = request.query.shouldReturnDraftIds?.at(-1) === 'true';
      const results = runtime.state.workUnits
        .filter((workUnit) => matchesRepeatedFilter(request.query.id, workUnit.id))
        .filter((workUnit) => matchesRepeatedFilter(request.query.projectId, workUnit.projectId))
        .filter((workUnit) => matchesRepeatedFilter(request.query.userId, workUnit.userId))
        .filter((workUnit) => {
          const project = runtime.state.projects.find(({ id }) => id === workUnit.projectId);
          return !!project && matchesRepeatedFilter(request.query.clientId, project.clientId);
        })
        .filter((workUnit) => !dateFrom || workUnit.date >= dateFrom)
        .filter((workUnit) => !dateTo || workUnit.date <= dateTo)
        .filter((workUnit) => matchesRepeatedFilter(request.query.state, workUnit.state))
        .filter((workUnit) => !!request.query.state || includeArchived || workUnit.state !== 'Archived')
        .map((workUnit) => toRawWorkUnit(runtime.state, workUnit));
      return {
        status: 200,
        json: {
          workUnits: { count: results.length, results },
          orders: [],
          draftIds: shouldReturnDraftIds
            ? runtime.state.workUnits.filter(({ state }) => state === 'Draft').map(({ id }) => id)
            : [],
        },
      };
    },
  },
];
