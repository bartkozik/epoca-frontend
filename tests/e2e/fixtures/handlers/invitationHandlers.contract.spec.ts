import { expect, test } from '@playwright/test';
import { buildWorld } from '../../worlds';
import { createWorldRuntime } from '../../worlds/runtime';
import { createMockApiDispatcher, parseMockRequest } from '../mockApi';
import { invitationHandlers, seedInvitationRecipient } from './invitationHandlers';
import type { MockResponse } from './types';

test('CT-208 @mr invitations capability belongs to the database owner', async () => {
  const runtime = createWorldRuntime(buildWorld('world-4'));
  const api = createMockApiDispatcher(runtime, invitationHandlers);
  const request = parseMockRequest({
    method: 'GET',
    url: 'http://127.0.0.1:5173/__e2e_api/organizations/epoca-e2e/invitations?version=2&pageNumber=1&pageSize=200',
  });
  runtime.setActor('owner');
  expect(await api.dispatch(request)).toMatchObject({
    status: 200,
    json: { count: 0, results: [], featureEnabled: true },
  });
  runtime.setActor('manager');
  expect((await api.dispatch(request)).status).toBe(404);
  runtime.setActor('anonymous');
  expect((await api.dispatch(request)).status).toBe(404);
});

test('CT-208 @mr invitation commands preserve revisions, replay and stale-link boundaries', async () => {
  const runtime = createWorldRuntime(buildWorld('world-4'));
  runtime.setActor('owner');
  const api = createMockApiDispatcher(runtime, invitationHandlers);
  const base = '/organizations/epoca-e2e/invitations';
  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    key = 'command-one',
  ): Promise<MockResponse> =>
    api.dispatch(
      parseMockRequest({
        method,
        url: `http://127.0.0.1:5173/__e2e_api${path}${path.includes('?') ? '&' : '?'}version=2`,
        body,
        headers: { 'Idempotency-Key': key, 'X-CSRF-Token': 'mock-invitation-csrf' },
      }),
    );
  const body = {
    firstName: 'Anna',
    lastName: 'Invited',
    email: 'anna@example.test',
    role: 'Employee',
    locale: 'pl',
  };
  expect(
    (await call('POST', base, { ...body, cooperation: { profile: null, terms: null } }, 'legacy-body')).status,
  ).toBe(400);
  const created = await call('POST', base, body);
  expect(created.status).toBe(201);
  expect(created.json).not.toHaveProperty('cooperation');
  const dto = created.json as { id: string };
  expect((await call('POST', base, body)).json).toEqual(created.json);
  expect((await call('POST', base, { ...body, role: 'Manager' })).status).toBe(409);
  expect((await call('PATCH', `${base}/${dto.id}`, { expectedRevision: '0', role: 'Manager' })).status).toBe(200);
  expect((await call('PATCH', `${base}/${dto.id}`, { expectedRevision: '0', role: 'Employee' })).status).toBe(409);
  const resent = await call('POST', `${base}/${dto.id}/resend`, { expectedRevision: '1' }, 'resend-one');
  expect(resent.status).toBe(200);
  expect((await call('POST', `${base}/${dto.id}/resend`, { expectedRevision: '1' }, 'resend-one')).json).toEqual(
    resent.json,
  );
  expect((await call('DELETE', `${base}/${dto.id}?expectedRevision=2`)).status).toBe(204);
  expect((await call('PATCH', `${base}/${dto.id}`, { expectedRevision: '3', role: 'Employee' })).status).toBe(409);
});

test('CT-208 @mr invitation fixtures use the active world organization', async () => {
  const runtime = createWorldRuntime(buildWorld('world-4'));
  runtime.state.organization = { ...runtime.state.organization!, slug: 'another-team', name: 'Another team' };
  runtime.setActor('owner');
  const api = createMockApiDispatcher(runtime, invitationHandlers);
  const request = (path: string) =>
    parseMockRequest({
      method: 'GET',
      url: `http://127.0.0.1:5173/__e2e_api${path}?version=2`,
    });
  expect((await api.dispatch(request('/organizations/another-team/invitations'))).status).toBe(200);
  expect((await api.dispatch(request('/organizations/epoca-e2e/invitations'))).status).toBe(404);
  const recipient = seedInvitationRecipient(runtime, 'Accept');
  const access = (path: string, body: unknown) =>
    api.dispatch(
      parseMockRequest({
        method: 'POST',
        url: `http://127.0.0.1:5173/__e2e_api/invitation-access/${path}`,
        body,
        headers: { 'X-CSRF-Token': 'mock-invitation-csrf' },
      }),
    );
  expect(await access('exchange', { token: recipient.token })).toMatchObject({
    status: 200,
    json: { organization: { slug: 'another-team', name: 'Another team' } },
  });
  expect(await access('accept', { expectedRevision: '0' })).toMatchObject({
    status: 200,
    json: { organizationSlug: 'another-team' },
  });
});
