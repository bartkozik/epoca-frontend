import { expect, test } from '../fixtures/epocaTest';

test.use({ world: 'world-1', actor: 'anonymous' });

for (const [status, message] of [
  [403, 'Check your permissions and try again, or contact support.'],
  [500, 'Request not found. Please check and retry or contact support.'],
  [401, 'Request not found. Please check and retry or contact support.'],
] as const) {
  test(`SAML ${status} @mr displays one error after SPA redirect to login`, async ({ page }) => {
    let exchanges = 0;
    await page.route('**/__e2e_api/organizations/acme/saml/login', async (route) => {
      exchanges += 1;
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ message: 'failed' }) });
    });
    await page.goto('/login-sso#token=single-use-token&slug=acme');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('loginEmailInput')).toBeVisible();
    await expect(page.getByText(message)).toHaveCount(1);
    await expect(page.getByText(message)).toBeVisible();
    expect(exchanges).toBe(1);
  });
}

for (const query of ['token=single-use-token', 'slug=acme', '']) {
  test(`incomplete SAML callback (${query || 'empty'}) @mr explains the missing login information`, async ({
    page,
  }) => {
    await page.goto(`/login-sso#${query}`);
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByText('Login problem. Please retry later or contact support.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('loginEmailInput')).toBeVisible();
  });
}

test('server SSO error without reason @mr is visible and preserves unrelated URL parameters', async ({ page }) => {
  await page.goto('/login?errorCode=403&next=reports');
  await expect(page).toHaveURL(/\/login\?next=reports$/);
  await expect(
    page.getByText('Check your permissions and try again, or contact support.', { exact: true }),
  ).toBeVisible();
});
