import { expect, test } from '@playwright/test';
import { runLiveOAuthClientLifecycle } from './oauthClientLifecycle';

const guardedEnvironment = {
  PLAYWRIGHT_LIVE_OAUTH_CLIENT_DISPOSABLE_REVIEW: 'true',
  PLAYWRIGHT_LIVE_OAUTH_CLIENT_REVIEW_ID: 'oauth-client-review-contract',
  PLAYWRIGHT_LIVE_OAUTH_CLIENT_REVIEW_ORG_ID: 'review-org-id',
  PLAYWRIGHT_LIVE_OAUTH_CLIENT_REVIEW_HOSTS: 'oauth-client-review-contract.example.invalid,api.oauth-client-review-contract.example.invalid',
  PLAYWRIGHT_LIVE_ALLOWED_ORG_ID: 'review-org-id',
  PLAYWRIGHT_LIVE_ALLOWED_HOSTS: 'oauth-client-review-contract.example.invalid',
  PLAYWRIGHT_LIVE_ALLOWED_API_HOSTS: 'api.oauth-client-review-contract.example.invalid',
  PLAYWRIGHT_LIVE_BASE_URL: 'https://oauth-client-review-contract.example.invalid',
  PLAYWRIGHT_LIVE_API_BASE_URL: 'https://api.oauth-client-review-contract.example.invalid/api/v1',
  PLAYWRIGHT_LIVE_ORG_SLUG: 'review-org',
  PLAYWRIGHT_LIVE_OWNER_EMAIL: 'owner@example.invalid',
  PLAYWRIGHT_LIVE_OWNER_PASSWORD: 'contract-password',
  PLAYWRIGHT_LIVE_MANAGER_EMAIL: 'manager@example.invalid',
  PLAYWRIGHT_LIVE_MANAGER_PASSWORD: 'contract-password',
  PLAYWRIGHT_LIVE_PM_EMAIL: 'pm@example.invalid',
  PLAYWRIGHT_LIVE_PM_PASSWORD: 'contract-password',
  PLAYWRIGHT_LIVE_USER_EMAIL: 'user@example.invalid',
  PLAYWRIGHT_LIVE_USER_PASSWORD: 'contract-password',
  PLAYWRIGHT_LIVE_EMPLOYEE_EMAIL: 'employee@example.invalid',
  PLAYWRIGHT_LIVE_EMPLOYEE_PASSWORD: 'contract-password',
};

// Returns a resolved Promise (not a bare Response) so every fetcher call site below can stay
// a plain `return jsonResponse(...)` -- fetcher's declared return type is Promise<Response>.
const jsonResponse = (status: number, body: unknown): Promise<Response> =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

test('OAuth client live lifecycle fails closed before network access without a disposable review marker @mr @technical', async () => {
  let requests = 0;
  await expect(
    runLiveOAuthClientLifecycle({
      env: { ...guardedEnvironment, PLAYWRIGHT_LIVE_OAUTH_CLIENT_DISPOSABLE_REVIEW: 'false' },
      fetcher: () => {
        requests += 1;
        throw new Error('must not reach the network');
      },
    })
  ).rejects.toThrow(/disposable review environment/i);
  expect(requests).toBe(0);
});

test('OAuth client live lifecycle rejects an organization outside the exact review boundary @mr @technical', async () => {
  let requests = 0;
  await expect(
    runLiveOAuthClientLifecycle({
      env: { ...guardedEnvironment, PLAYWRIGHT_LIVE_OAUTH_CLIENT_REVIEW_ORG_ID: 'different-org' },
      fetcher: () => {
        requests += 1;
        throw new Error('must not reach the network');
      },
    })
  ).rejects.toThrow(/review organization/i);
  expect(requests).toBe(0);
});

test('OAuth client ambiguous create timeout reconciles its recorded intent and revokes the exact client @mr @technical', async () => {
  const calls: string[] = [];
  const created = {
    clientId: 'epoca_oauth_client_v1_ambiguous',
    name: 'oauth-client-review-contract-rotation',
    status: 'Active',
    version: 1,
  };
  const fetcher: typeof fetch = (input, init) => {
    const url = new URL(String(input));
    const call = `${init?.method ?? 'GET'} ${url.pathname}${url.search}`;
    calls.push(call);
    if (url.pathname.endsWith('/auth/login')) {
      return jsonResponse(200, { accessToken: 'owner-access-placeholder' });
    }
    if (url.pathname.endsWith('/organizations/review-org') && init?.method === 'GET') {
      return jsonResponse(200, { id: 'review-org-id' });
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'POST') {
      throw new Error('connection closed after commit');
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'GET') {
      return jsonResponse(200, { count: 1, results: [created] });
    }
    if (url.pathname.endsWith(`/oauth-clients/${created.clientId}`)) return jsonResponse(200, created);
    if (url.pathname.endsWith(`/oauth-clients/${created.clientId}/revoke`)) {
      return jsonResponse(200, { ...created, status: 'Revoked', version: 2 });
    }
    throw new Error('unexpected contract request');
  };

  await expect(runLiveOAuthClientLifecycle({ env: guardedEnvironment, fetcher })).rejects.toThrow(
    /connection closed after commit/
  );
  expect(calls).toContain('GET /api/v1/organizations/review-org/oauth-clients?pageNumber=1&pageSize=100');
  expect(calls).toContain(`POST /api/v1/organizations/review-org/oauth-clients/${created.clientId}/revoke`);
});
