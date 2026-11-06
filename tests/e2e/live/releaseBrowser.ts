import { readFile } from 'node:fs/promises';
import { expect, type Page } from '@playwright/test';
import { z } from 'zod';
import { resolveAllowedOrganizationChoice } from './liveFlows';
import { readReleaseFixture, releaseEnvironment } from './releaseEnvironment';
import { assertReleaseRequest, type ReleasePolicy } from './releasePolicy';

export const installReleaseGuard = async (page: Page): Promise<void> => {
  const env = releaseEnvironment();
  const policy: ReleasePolicy = {
    phase: env.phase,
    frontendOrigin: env.frontend.origin,
    apiBaseURL: env.api.href,
    organizationSlug: env.organizationSlug,
    projectIds: [],
  };
  await page.route('**/*', async (route) => {
    const request = route.request();
    try {
      const body: unknown = request.postData() ? request.postDataJSON() : undefined;
      assertReleaseRequest(policy, request.url(), request.method(), body);
      await route.continue();
    } catch {
      await route.abort('blockedbyclient');
      throw new Error('Release network guard rejected an unexpected request');
    }
  });
};

export const verifySamlInitiation = async (page: Page): Promise<void> => {
  const env = releaseEnvironment();
  await installReleaseGuard(page);
  const responsePromise = page.waitForResponse(
    (response) => response.url() === `${env.api.href}/organizations/iterators/saml/authn`,
  );
  await page.goto('/login');
  const response = await responsePromise;
  if (!response.ok()) throw new Error('SAML initiation endpoint failed');
  const value: unknown = await response.json();
  const body = z.object({ samlRequest: z.string().min(1), ssoUrl: z.string().url() }).parse(value);
  const idp = new URL(body.ssoUrl);
  if (idp.protocol !== 'https:' || idp.username || idp.password)
    throw new Error('SAML initiation did not provide a safe IdP URL');
  const form = page.locator('form').filter({ has: page.getByTestId('workspaceLoginButton') });
  await expect(form).toHaveAttribute('action', body.ssoUrl);
  await expect(form.locator('input[name="SAMLRequest"]')).toHaveValue(body.samlRequest);
  await expect(page.getByTestId('workspaceLoginButton')).toBeEnabled();
};

export const loginReadOnly = async (page: Page): Promise<void> => {
  const env = releaseEnvironment();
  await installReleaseGuard(page);
  await page.goto('/login');
  await page.evaluate((slug) => {
    localStorage.setItem(`IteratorsEpoca__org__slug_${window.location.hostname}`, slug);
  }, env.organizationSlug);
  await page.getByTestId('loginEmailInput').fill(z.string().min(1).parse(process.env.PLAYWRIGHT_LIVE_OWNER_EMAIL));
  await page
    .getByTestId('loginPasswordInput')
    .fill(z.string().min(1).parse(process.env.PLAYWRIGHT_LIVE_OWNER_PASSWORD));
  const organizations = page.waitForResponse(
    (response) => response.url() === `${env.api.href}/organizations` && response.request().method() === 'GET',
  );
  await page.getByTestId('loginButton').click();
  const response = await organizations;
  if (!response.ok()) throw new Error('Read-only login could not load organizations');
  const value: unknown = await response.json();
  const choice = resolveAllowedOrganizationChoice(value, env.target.organizationId, env.organizationSlug);
  await expect(page).toHaveURL(/\/(select-organization|working-time)$/);
  if (new URL(page.url()).pathname === '/select-organization') await page.getByText(choice, { exact: true }).click();
  await expect(page).toHaveURL(/\/working-time$/);
};

export const verifyCompatibilityReads = async (page: Page): Promise<void> => {
  const fixture = await readReleaseFixture();
  await page.goto('/projects');
  await expect(page.getByText(fixture.projectName, { exact: true }).first()).toBeVisible();
  await page.goto(`/projects/${encodeURIComponent(fixture.projectId)}/project-details`);
  await expect(page.getByText(fixture.projectName, { exact: true }).first()).toBeVisible();
  const env = releaseEnvironment();
  const unitsPath = `${env.api.pathname}/organizations/${fixture.organizationSlug}/work-units`;
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.origin === env.api.origin && url.pathname === unitsPath) {
      url.searchParams.set('id', fixture.workUnitId);
      await route.fallback({ url: url.href });
    } else await route.fallback();
  });
  const report = page.waitForResponse(
    (response) => new URL(response.url()).pathname === unitsPath && response.request().method() === 'GET',
  );
  await page.goto(`/report?startDate=${fixture.date}&endDate=${fixture.date}`);
  const response = await report;
  if (!response.ok()) throw new Error('Compatibility report read failed');
  const value: unknown = await response.json();
  const rowSchema = z.object({
    id: z.string(),
    description: z.string(),
    date: z.string(),
    projectClient: z.object({ projectId: z.string() }),
  });
  const rowsSchema = z.object({ results: z.array(rowSchema) });
  const result = z
    .union([z.object({ workUnits: rowsSchema }).transform((result) => result.workUnits), rowsSchema])
    .parse(value);
  const row = result.results.find((entry) => entry.id === fixture.workUnitId);
  if (
    !row ||
    row.description !== fixture.description ||
    row.date !== fixture.date ||
    row.projectClient.projectId !== fixture.projectId
  )
    throw new Error('Compatibility fixture readback differs');
  await expect(page.locator('tbody tr').filter({ hasText: fixture.description }).first()).toBeVisible();
  await page.locator('tbody tr').filter({ hasText: fixture.description }).first().getByRole('checkbox').check();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const download = await downloadPromise;
  const filename = await download.path();
  if (!filename || (await download.failure())) throw new Error('Compatibility CSV export failed');
  if (!(await readFile(filename, 'utf8')).includes(fixture.description))
    throw new Error('Compatibility CSV omits the prepared worklog');
};
