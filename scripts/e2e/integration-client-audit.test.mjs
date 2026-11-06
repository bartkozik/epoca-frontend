import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { integrationClientHandlers } from '../../tests/e2e/fixtures/handlers/integrationClientHandlers.ts';
import { createMockApiDispatcher, parseMockRequest } from '../../tests/e2e/fixtures/mockApi.ts';
import { IDS } from '../../tests/e2e/worlds/ids.ts';
import { buildWorld } from '../../tests/e2e/worlds/index.ts';
import { createWorldRuntime } from '../../tests/e2e/worlds/runtime.ts';

const auditPageSchema = z.object({ results: z.array(z.object({ id: z.string() }).passthrough()) });

void test('audit handler isolates one client and strips the private association before pagination output', () => {
  const activeId = 'epoca_oauth_client_v1_active';
  const otherId = 'epoca_oauth_client_v1_other';
  /** @param {string} clientId */
  const client = (clientId) => ({ clientId, name: clientId, status: 'Active', version: 1 });
  /** @param {string} id @param {string} clientId */
  const event = (id, clientId) => ({
    clientId,
    id,
    occurredAt: '2026-08-27T08:00:00Z',
    actorType: 'Human',
    actorUserId: 'owner-id',
    actor: { userId: 'owner-id', displayName: 'Owner User' },
    eventType: 'Create',
    outcome: 'Success',
    metadata: { version: 1 },
  });
  const runtime = {
    actor: 'owner',
    state: {
      actors: { owner: { organizationRoles: ['Owner'] } },
      oauthIntegration: {
        clients: [client(activeId), client(otherId)],
        auditEvents: [event('event-active', activeId), event('event-other', otherId)],
      },
    },
  };
  const handler = integrationClientHandlers.find(({ id }) => id === 'oauth-client-audit');
  const response = handler.handle(
    {
      method: 'GET',
      path: `/organizations/epoca-e2e/oauth-clients/${activeId}/audit-events`,
      query: { pageNumber: ['1'], pageSize: ['1'] },
      headers: {},
    },
    runtime,
  );
  const { clientId: _privateAssociation, ...publicActive } = event('event-active', activeId);

  assert.deepEqual(response.json, { count: 1, results: [publicActive] });
  assert.equal('clientId' in auditPageSchema.parse(response.json).results[0], false);
});

void test('browser audit pagination derives deterministic event IDs from the shared world registry', async () => {
  const source = await readFile(
    fileURLToPath(new URL('../../tests/e2e/specs/integration-clients.spec.ts', import.meta.url)),
    'utf8',
  );

  assert.match(source, /import \{ IDS \} from '\.\.\/worlds\/ids';/);
  assert.match(source, /IDS\.oauthAuditActive/);
  assert.match(source, /IDS\.oauthAuditExpired/);
  assert.doesNotMatch(source, /62000000-/);
});

void test('actual world-6 handler contract uses the shared audit IDs without literal drift', async () => {
  const runtime = createWorldRuntime(buildWorld('world-6'));
  runtime.setActor('owner');
  const dispatcher = createMockApiDispatcher(runtime, integrationClientHandlers);
  const dispatchAudit = (clientId) =>
    dispatcher.dispatch(
      parseMockRequest({
        method: 'GET',
        url: `http://127.0.0.1:3000/__e2e_api/organizations/epoca-e2e/oauth-clients/${clientId}/audit-events?pageNumber=1&pageSize=1`,
      }),
    );

  const active = await dispatchAudit('epoca_oauth_client_v1_active');
  const expired = await dispatchAudit('epoca_oauth_client_v1_expired');
  assert.deepEqual(
    auditPageSchema.parse(active.json).results.map(({ id }) => id),
    [IDS.oauthAuditActive],
  );
  assert.deepEqual(
    auditPageSchema.parse(expired.json).results.map(({ id }) => id),
    [IDS.oauthAuditExpired],
  );

  const contractSource = await readFile(
    fileURLToPath(
      new URL('../../tests/e2e/fixtures/handlers/integrationClientHandlers.contract.spec.ts', import.meta.url),
    ),
    'utf8',
  );
  assert.match(contractSource, /import \{ IDS \} from '\.\.\/\.\.\/worlds\/ids';/);
  assert.doesNotMatch(contractSource, /62000000-/);
});
