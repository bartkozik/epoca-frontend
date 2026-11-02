import { expect, test, type Page } from '@playwright/test';

const appUrl = process.env.VITE_PUBLIC_URL || 'http://127.0.0.1:4173';

const accessToken = [
  Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
  Buffer.from(
    JSON.stringify({
      exp: 4102444800,
      id: 'user-1',
      identities: [
        {
          deviceId: null,
          id: 'identity-1',
          main: true,
          type: 'MailAddress',
          value: 'person@example.com',
        },
      ],
      isSuperAdmin: false,
      roles: [],
    })
  ).toString('base64url'),
  'test-signature',
].join('.');

type RequestCounts = {
  frontendTelemetry: number;
  logout: number;
  organizations: number;
  refresh: number;
};

type OrganizationResponse = {
  archivedAt: null;
  createdAt: string;
  createdBy: Record<string, never>;
  id: string;
  modifiedAt: string;
  modifiedBy: Record<string, never>;
  name: string;
  slug: string;
};

const organization = (id: string, name: string, slug: string): OrganizationResponse => ({
  archivedAt: null,
  createdAt: '2026-08-15T08:00:00Z',
  createdBy: {},
  id,
  modifiedAt: '2026-08-15T08:00:00Z',
  modifiedBy: {},
  name,
  slug,
});

const installAuthRoutes = async (
  page: Page,
  counts: RequestCounts,
  organizationsResponse: { body: unknown; status: number },
  logoutStatus = 204
): Promise<void> => {
  await page.route('**/api/v1/organizations/iterators/saml/authn', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ samlRequest: 'test-request', ssoUrl: 'https://sso.example.test' }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route('**/api/v1/auth/login', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ accessToken, refreshToken: 'refresh-token' }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route('**/api/v1/organizations', async (route) => {
    counts.organizations += 1;
    await route.fulfill({
      body: JSON.stringify(organizationsResponse.body),
      contentType: 'application/json',
      headers: { 'Correlation-Id': 'organizations-correlation-id' },
      status: organizationsResponse.status,
    });
  });

  await page.route('**/api/v1/auth/refresh-token', async (route) => {
    counts.refresh += 1;
    await route.fulfill({ body: '{}', contentType: 'application/json', status: 500 });
  });

  await page.route('**/api/v1/auth/refresh-tokens/*', async (route) => {
    counts.logout += 1;
    await route.fulfill({ body: '{}', contentType: 'application/json', status: logoutStatus });
  });

  await page.route('**/api/v1/metrics/frontend/error', async (route) => {
    counts.frontendTelemetry += 1;
    await route.fulfill({ body: '{}', contentType: 'application/json', status: 500 });
  });
};

const login = async (page: Page): Promise<void> => {
  await page.goto(appUrl);
  await page.getByTestId('loginEmailInput').fill('person@example.com');
  await page.getByTestId('loginPasswordInput').fill('Secret1!');
  await page.getByTestId('loginButton').click();
};

test('bounds an organizations 500 without logout, refresh, or repeated toast requests', async ({ page }) => {
  const counts: RequestCounts = { frontendTelemetry: 0, logout: 0, organizations: 0, refresh: 0 };
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installAuthRoutes(page, counts, { body: { title: 'organizations unavailable' }, status: 500 });

  await page.goto(appUrl);
  await page.getByTestId('loginEmailInput').fill('person@example.com');
  await page.getByTestId('loginPasswordInput').fill('Secret1!');
  await page.getByTestId('loginButton').click();

  await expect(page.getByText('Workspace service is temporarily unavailable.')).toBeVisible();
  await page.waitForTimeout(100);
  expect(pageErrors).toEqual([]);
  await expect(page.getByText('Failed to fetch workspaces data')).toHaveCount(1);
  await expect.poll(() => counts.frontendTelemetry).toBe(1);
  await page.waitForTimeout(500);
  expect(counts.organizations).toBe(1);
  expect(counts.refresh).toBe(0);
  expect(counts.logout).toBe(0);
  expect(counts.frontendTelemetry).toBe(1);
});

test('keeps logout terminal when remote token invalidation returns 500', async ({ page }) => {
  const counts: RequestCounts = { frontendTelemetry: 0, logout: 0, organizations: 0, refresh: 0 };
  await installAuthRoutes(
    page,
    counts,
    {
      body: {
        count: 2,
        results: [
          organization('organization-1', 'First workspace', 'first-workspace'),
          organization('organization-2', 'Second workspace', 'second-workspace'),
        ],
      },
      status: 200,
    },
    500
  );

  await login(page);
  await expect(page.getByText('First workspace')).toBeVisible();
  await page.getByRole('button', { name: 'Logout' }).click();

  await expect(page).toHaveURL(`${appUrl}/login`);
  const authStorage = await page.evaluate(() => ({
    accessToken: localStorage.getItem(`IteratorsEpoca__auth__access_tok_${window.location.hostname}`),
    refreshToken: localStorage.getItem(`IteratorsEpoca__auth__ref_tok_${window.location.hostname}`),
  }));
  expect(authStorage).toEqual({ accessToken: null, refreshToken: null });
  expect(counts.organizations).toBe(1);
  expect(counts.logout).toBe(1);
  expect(counts.refresh).toBe(0);
});
