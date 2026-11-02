import { createActorToken } from '../fixtures/auth';
import { expect, test } from '../fixtures/epocaTest';
import { toRawOrganization } from '../fixtures/handlers/organizationHandlers';

test.use({ world: 'world-3', actor: 'anonymous' });
test('CT-564 @mr successful SSO activates the requested workspace for a multi-org user', async ({
  page,
  worldData,
  runtime,
}) => {
  const org = toRawOrganization(worldData)!;
  await page.route('**/__e2e_api/organizations', (route) =>
    route.fulfill({
      json: { count: 2, results: [org, { ...org, id: 'second-org', slug: 'second-org', name: 'Second Org' }] },
    }),
  );
  await page.route('**/__e2e_api/organizations/epoca-e2e', async (route) => {
    await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({ json: org });
  });
  await page.route('**/__e2e_api/organizations/epoca-e2e/saml/login', async (route) => {
    runtime.setActor('owner');
    await route.fulfill({ json: { accessToken: createActorToken(worldData, 'owner'), refreshToken: 'test-refresh' } });
  });
  await page.goto('/login-sso#token=once&slug=epoca-e2e');
  await expect(page).toHaveURL(/\/working-time$/, { timeout: 5000 });
});
