import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';

const execute = promisify(execFile);
const runtime = async (): Promise<Record<string, string>> =>
  Object.fromEntries(
    (await readFile(process.env.INVITATION_BROWSER_ENV_FILE!, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => {
        const split = line.indexOf('=');
        return [line.slice(0, split), line.slice(split + 1)];
      }),
  );
const control = async (env: Record<string, string>, path: string): Promise<unknown> => {
  const container = process.env.INVITATION_BROWSER_CONTAINER;
  if (!container?.match(/^epoca-ct208-invitation-browser-[a-f0-9]{12}$/))
    throw new Error('Owned invitation runtime container required');
  try {
    const result = await execute('docker', [
      'exec',
      container,
      'curl',
      '--silent',
      '--fail',
      '--max-time',
      '5',
      '-H',
      `X-Invitation-Browser-Control: ${env.INVITATION_BROWSER_CONTROL_KEY}`,
      `http://127.0.0.1:19069/${path}`,
    ]);
    return JSON.parse(result.stdout) as unknown;
  } catch {
    throw new Error('Invitation runtime control is not ready');
  }
};
const login = async (page: Page, email: string, password: string): Promise<string> => {
  await page.goto('/login');
  await page.getByTestId('loginEmailInput').fill(email);
  await page.getByTestId('loginPasswordInput').fill(password);
  const response = page.waitForResponse(
    (value) => value.request().method() === 'POST' && new URL(value.url()).pathname === '/api/v1/auth/login',
  );
  await page.getByTestId('loginButton').click();
  const result = await response;
  expect(result.status()).toBe(200);
  const body = (await result.json()) as { accessToken: string };
  await expect(page).toHaveURL(/\/working-time$/);
  return body.accessToken;
};
for (const scenario of [
  { role: 'Manager', width: 1280 },
  { role: 'Employee', width: 390 },
] as const) {
  test(`CT-208 @live real invitation activates ${scenario.role} and persists credentials`, async ({
    browser,
    page,
  }, testInfo) => {
    const env = await runtime();
    const fixture = (await control(env, 'health')) as { organizationSlug: string };
    const ownerToken = await login(page, 'owner@example.test', env.INVITATION_BROWSER_OWNER_PASSWORD);
    const email = `invite-${randomUUID()}@example.test`;
    const password = `Recipient!${randomUUID()}`;
    await page.setViewportSize({ width: scenario.width, height: scenario.width === 390 ? 844 : 900 });
    await page.goto('/team-settings/members/list');
    await page.getByRole('button', { name: 'Add team member', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Add team member' });
    await dialog.getByLabel('First name', { exact: true }).fill('Browser');
    await dialog.getByLabel('Last name', { exact: true }).fill(scenario.role);
    await dialog.getByLabel('Email', { exact: true }).fill(email);
    if (scenario.role === 'Manager') {
      await dialog.getByLabel('Role', { exact: true }).click();
      await page.getByRole('option', { name: 'Manager', exact: true }).click();
    }
    if (scenario.width === 1280) {
      await dialog.getByLabel('First name', { exact: true }).focus();
      await page.screenshot({ path: testInfo.outputPath('invitation-form-desktop.png') });
    }
    const createdResponse = page.waitForResponse(
      (response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/invitations'),
    );
    await dialog.getByRole('button', { name: 'Create invitation', exact: true }).click();
    const created = await createdResponse;
    expect(created.status()).toBe(201);
    expect(((await created.json()) as { revision: string }).revision).toBe('0');
    await expect(dialog).toHaveCount(0);
    let link = '';
    await expect
      .poll(async () => {
        try {
          link = ((await control(env, `mail?email=${encodeURIComponent(email)}`)) as { link: string }).link;
          return Boolean(link);
        } catch {
          return false;
        }
      })
      .toBe(true);
    const recipient = await browser.newContext({
      baseURL: 'http://127.0.0.1:3018',
      locale: 'pl-PL',
      viewport: { width: scenario.width, height: scenario.width === 390 ? 844 : 900 },
    });
    try {
      const accept = await recipient.newPage();
      await accept.goto(link);
      await expect(accept).toHaveURL('http://127.0.0.1:3018/invitations/accept');
      await expect(accept.getByTestId('invitationPassword')).toBeVisible();
      const cookies = await recipient.cookies();
      const cookie = cookies.find((value) => value.name === 'epoca_invitation_access');
      expect(
        cookie && { httpOnly: cookie.httpOnly, path: cookie.path, sameSite: cookie.sameSite, secure: cookie.secure },
      ).toEqual({ httpOnly: true, path: '/api/v1', sameSite: 'Lax', secure: false });
      expect(await accept.evaluate(() => document.cookie.includes('epoca_invitation_access'))).toBe(false);
      await accept.reload();
      await expect(accept.getByTestId('invitationPassword')).toBeVisible();
      if (scenario.width === 390)
        await accept.screenshot({ path: testInfo.outputPath('invitation-recipient-mobile.png') });
      // Only status codes leave the browser. Never persist the summary CSRF or response bodies.
      const statuses = await accept.evaluate(async (password) => {
        const statuses: number[] = [];
        for (const wrong of [undefined, 'wrong-csrf']) {
          const result = await fetch('/api/v1/invitation-access/password', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'device-id': crypto.randomUUID(),
              ...(wrong ? { 'X-CSRF-Token': wrong } : {}),
            },
            body: JSON.stringify({ expectedRevision: '0', password }),
          });
          statuses.push(result.status);
        }
        return statuses;
      }, password);
      expect(statuses).toEqual([403, 403]);
      await accept.getByTestId('invitationPassword').fill(password);
      await accept.getByTestId('invitationConfirmation').fill('Mismatch!123');
      await accept.getByTestId('invitationSubmit').click();
      await expect(accept.getByRole('alert')).toContainText('same password');
      await accept.getByTestId('invitationConfirmation').fill(password);
      const joinedResponse = accept.waitForResponse(
        (response) => new URL(response.url()).pathname === '/api/v1/invitation-access/password',
      );
      await accept.getByTestId('invitationSubmit').click();
      expect((await joinedResponse).status()).toBe(200);
      await expect(accept).toHaveURL(/\/working-time$/);
      const members = await page.request.get(`/api/v1/organizations/${fixture.organizationSlug}/users`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(members.status()).toBe(200);
      const body = (await members.json()) as Array<{
        id: string;
        firstName: string;
        lastName: string;
        organizationRoles: string[];
        identities: Array<{ value: string }>;
      }>;
      const member = body.find((value) => value.identities.some((identity) => identity.value === email));
      expect(member?.organizationRoles).toEqual([scenario.role]);
      const fresh = await browser.newContext({ baseURL: 'http://127.0.0.1:3018', locale: 'pl-PL' });
      try {
        await login(await fresh.newPage(), email, password);
      } finally {
        await fresh.close();
      }
    } finally {
      await recipient.close();
    }
  });
}
