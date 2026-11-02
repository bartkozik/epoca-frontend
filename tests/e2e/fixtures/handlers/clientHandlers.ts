import type { BuiltWorld } from '../../worlds';
import type { WorldClient } from '../../worlds/types';
import type { MockHandler } from './types';

const AUDIT_DATE = '2026-01-01T00:00:00.000Z';

interface RawClientFixture {
  archivedAt: string | null;
  color: string;
  createdAt: string;
  createdBy: string;
  createdByDetails: null;
  id: string;
  logo: string;
  modifiedAt: string;
  modifiedBy: string;
  modifiedByDetails: null;
  name: string;
  organizationId: string;
  projectCount: number;
  texture: string;
  type: WorldClient['type'];
}

export const toRawClient = (
  world: BuiltWorld,
  client: WorldClient,
  includeArchivedConnections = false
): RawClientFixture => ({
  archivedAt: client.archivedAt,
  color: client.color ?? '',
  createdAt: AUDIT_DATE,
  createdBy: 'e2e-system',
  createdByDetails: null,
  id: client.id,
  logo: client.logo ?? '',
  modifiedAt: AUDIT_DATE,
  modifiedBy: 'e2e-system',
  modifiedByDetails: null,
  name: client.name,
  organizationId: world.organization?.id ?? '',
  projectCount: world.projects.filter(
    ({ archivedAt, clientId }) => clientId === client.id && (includeArchivedConnections || archivedAt === null)
  ).length,
  texture: client.texture ?? '',
  type: client.type,
});

const matchesRepeatedFilter = (values: readonly string[] | undefined, candidate: string): boolean =>
  !values || values.includes(candidate);

export const clientHandlers: MockHandler[] = [
  {
    id: 'clients-list',
    method: 'GET',
    path: /^\/organizations\/epoca-e2e\/clients$/,
    handle: (request, runtime) => {
      const includeArchived = request.query.includeArchived?.includes('true') ?? false;
      const includeArchivedConnections = request.query.includeArchivedConnections?.includes('true') ?? false;
      const results = runtime.state.clients
        .filter(({ archivedAt }) => includeArchived || archivedAt === null)
        // useClientQuery (src/modules/clients/hooks/useClientQuery.ts) fetches a single client via
        // this same list endpoint with an `id` filter -- without this, every `id`-filtered request
        // silently returned the full unfiltered list and callers taking `results[0]` got whichever
        // client happened to be first, not the one they asked for.
        .filter(({ id }) => matchesRepeatedFilter(request.query.id, id))
        .map((client) => toRawClient(runtime.state, client, includeArchivedConnections));
      return { status: 200, json: { count: results.length, results } };
    },
  },
];
