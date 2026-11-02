import { expect, test } from '@playwright/test';
import { buildWorld } from '../../worlds';
import { IDS } from '../../worlds/ids';
import { createWorldRuntime } from '../../worlds/runtime';
import { createMockApiDispatcher, parseMockRequest, UnknownMockRequestError } from '../mockApi';
import { integrationClientHandlers } from './integrationClientHandlers';
import type { MockRequest } from './types';

const collection = '/organizations/epoca-e2e/oauth-clients';
const request = (method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): MockRequest =>
  parseMockRequest({ method, url: `http://127.0.0.1:5173/__e2e_api${path}`, body });

test('OAuth client @mr @oauth-client handlers reject route body and version mismatches', async () => {
  const runtime = createWorldRuntime(buildWorld('world-6'));
  runtime.setActor('owner');
  const dispatcher = createMockApiDispatcher(runtime, integrationClientHandlers);

  await expect(
    dispatcher.dispatch(request('POST', `${collection}/unknown/revoke/extra`, { expectedVersion: 1 }))
  ).rejects.toBeInstanceOf(UnknownMockRequestError);
  expect((await dispatcher.dispatch(request('POST', collection, { name: 'missing contract fields' }))).status).toBe(400);
  expect(
    (
      await dispatcher.dispatch(
        request('PATCH', `${collection}/epoca_oauth_client_v1_active`, {
          expectedVersion: 4,
          name: 'stale update',
        })
      )
    ).status
  ).toBe(409);
});

test('OAuth client @mr @oauth-client mutations are isolated per runtime and secret-free outside one-time responses', async () => {
  const first = createWorldRuntime(buildWorld('world-6'));
  const second = createWorldRuntime(buildWorld('world-6'));
  first.setActor('owner');
  second.setActor('owner');
  const firstDispatcher = createMockApiDispatcher(first, integrationClientHandlers);
  const secondDispatcher = createMockApiDispatcher(second, integrationClientHandlers);
  const createBody = {
    name: 'Runtime owned integration',
    scopes: ['organization:read'],
    projectAccess: { mode: 'AllProjects' },
    expiresAt: null,
  };

  const created = await firstDispatcher.dispatch(request('POST', collection, createBody));
  expect(created.status).toBe(201);
  expect(typeof (created.json as { clientSecret?: unknown }).clientSecret).toBe('string');
  expect(JSON.stringify((created.json as { client: unknown }).client)).not.toMatch(/clientSecret|secretHash|accessToken/i);
  expect(first.journal.entries.at(-1)?.responseBody).toMatchObject({ clientSecret: '[REDACTED]' });

  const firstList = await firstDispatcher.dispatch(request('GET', `${collection}?pageSize=20&pageNumber=1`));
  const secondList = await secondDispatcher.dispatch(request('GET', `${collection}?pageSize=20&pageNumber=1`));
  expect((firstList.json as { count: number }).count).toBe(4);
  expect((secondList.json as { count: number }).count).toBe(3);
});

test('OAuth client @mr @oauth-client ordinary users receive 403 from forced management requests', async () => {
  const runtime = createWorldRuntime(buildWorld('world-6'));
  runtime.setActor('user');
  const dispatcher = createMockApiDispatcher(runtime, integrationClientHandlers);

  expect((await dispatcher.dispatch(request('GET', `${collection}?pageSize=20&pageNumber=1`))).status).toBe(403);
  expect(
    (
      await dispatcher.dispatch(
        request('POST', collection, {
          name: 'Forbidden integration',
          scopes: ['organization:read'],
          projectAccess: { mode: 'AllProjects' },
        })
      )
    ).status
  ).toBe(403);
  expect(runtime.state.oauthIntegration?.clients).toHaveLength(3);
});

test('OAuth client @mr @oauth-client audit pagination isolates events by client and returns only public fields', async () => {
  const runtime = createWorldRuntime(buildWorld('world-6'));
  runtime.setActor('owner');
  const dispatcher = createMockApiDispatcher(runtime, integrationClientHandlers);

  const active = await dispatcher.dispatch(
    request('GET', `${collection}/epoca_oauth_client_v1_active/audit-events?pageNumber=1&pageSize=1`)
  );
  const expired = await dispatcher.dispatch(
    request('GET', `${collection}/epoca_oauth_client_v1_expired/audit-events?pageNumber=1&pageSize=1`)
  );
  expect(active.status).toBe(200);
  expect(expired.status).toBe(200);
  expect(active.json).toMatchObject({ count: 1, results: [{ id: IDS.oauthAuditActive }] });
  expect(expired.json).toMatchObject({ count: 1, results: [{ id: IDS.oauthAuditExpired }] });
  expect(JSON.stringify(active.json)).not.toMatch(/clientId|epoca_oauth_client_v1_expired/);
  expect(JSON.stringify(expired.json)).not.toMatch(/clientId|epoca_oauth_client_v1_active/);
});
