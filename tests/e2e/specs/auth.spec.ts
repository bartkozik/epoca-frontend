import { AVATAR_SYNC_POLL_INTERVAL_MS } from '../../../src/modules/users/hooks/avatarSyncPolling';
import { expect, test } from '../fixtures/epocaTest';

test.use({ world: 'world-1', actor: 'anonymous' });

test('anonymous @mr sees login without staging traffic', async ({ page, runtime }) => {
  const stagingRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('epoca-staging.company-5897fee414.example.invalid')) stagingRequests.push(request.url());
  });

  await page.goto('/working-time');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('loginEmailInput')).toBeVisible();
  expect(stagingRequests).toEqual([]);

  const deviceId = await page.evaluate(() =>
    localStorage.getItem(`IteratorsEpoca__auth__device_id_${window.location.hostname}`),
  );
  expect(deviceId).toBe('e2e-device-0001');

  const logoutStatus = await page.evaluate(async (storedDeviceId) => {
    const response = await fetch(`/__e2e_api/auth/refresh-tokens/${storedDeviceId}`, { method: 'DELETE' });
    return response.status;
  }, deviceId);
  expect(logoutStatus).toBe(204);
  expect(runtime.journal.last('DELETE', '/auth/refresh-tokens/e2e-device-0001')?.responseStatus).toBe(204);
});

test.describe('login', () => {
  test.use({ world: 'world-2', actor: 'anonymous' });

  test('owner @mr logs in and reaches the single organization', async ({ page, runtime }) => {
    await page.goto('/login');
    await page.getByTestId('loginEmailInput').fill('owner@example.test');
    await page.getByTestId('loginPasswordInput').fill('E2e-password-1!');
    await page.getByTestId('loginButton').click();

    await expect(page).toHaveURL(/\/working-time$/);
    await expect(page.getByRole('heading', { name: 'Working time' })).toBeVisible();
    expect(runtime.actor).toBe('owner');
  });

  test('owner @mr sees the Google-synced avatar fetched from the user profile endpoint', async ({ page, runtime }) => {
    const ownerUserId = runtime.state.actors.owner?.userId;
    const ownerUser = runtime.state.users.find(({ id }) => id === ownerUserId);
    if (!ownerUser) throw new Error('owner user missing from world-2 fixture');
    // A real, inline-loadable image: an https:// avatar URL isn't mocked (no CDN host to route to)
    // and gets aborted by the mock API's catch-all, which is indistinguishable from a genuinely
    // broken avatar -- UserInitialsAvatar's onError fallback then (correctly) swaps to initials.
    const syncedAvatar =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    await page.goto('/login');
    await page.getByTestId('loginEmailInput').fill('owner@example.test');
    await page.getByTestId('loginPasswordInput').fill('E2e-password-1!');
    await page.getByTestId('loginButton').click();
    await expect(page).toHaveURL(/\/working-time$/);

    const navbarAvatar = page.getByTestId('user-avatar-menu-button');
    await expect
      .poll(() => runtime.journal.entries.filter(({ path }) => path === `/users/${ownerUserId}`).length)
      .toBeGreaterThan(0);
    await expect(navbarAvatar.getByRole('img')).toHaveCount(0);
    await expect(navbarAvatar.getByText('OU', { exact: true })).toBeVisible();
    const avatarBounds = await navbarAvatar.getByText('OU', { exact: true }).locator('..').boundingBox();
    expect(avatarBounds?.width).toBe(avatarBounds?.height);
    ownerUser.avatar = syncedAvatar;
    await page.clock.runFor(AVATAR_SYNC_POLL_INTERVAL_MS);
    await expect(navbarAvatar.getByRole('img', { name: 'Owner User' })).toHaveAttribute('src', syncedAvatar, {
      timeout: AVATAR_SYNC_POLL_INTERVAL_MS + 5_000,
    });
  });

  test('password visibility button hides password again once focus leaves it @mr', async ({ page }) => {
    await page.goto('/login');

    const passwordInput = page.getByTestId('loginPasswordInput');
    const visibilityButton = page.getByTestId('loginPasswordVisibilityButton');

    await passwordInput.fill('E2e-password-1!');
    await visibilityButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    await page.getByTestId('loginEmailInput').click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });
});

test.describe('preseeded session', () => {
  test.use({ world: 'world-4', actor: 'owner' });

  test('preseeded owner @mr keeps deterministic auth and project identity', async ({ page }) => {
    await page.goto('/working-time');
    await expect(page).toHaveURL(/\/working-time$/);

    const sessionStorage = await page.evaluate(() => {
      const suffix = window.location.hostname;
      const prefix = 'IteratorsEpoca__';
      const access = localStorage.getItem(`${prefix}auth__access_tok_${suffix}`);
      return {
        access: access ? JSON.parse(access) : null,
        device: localStorage.getItem(`${prefix}auth__device_id_${suffix}`),
        refresh: localStorage.getItem(`${prefix}auth__ref_tok_${suffix}`),
        organization: localStorage.getItem(`${prefix}org__slug_${suffix}`),
        language: localStorage.getItem(`${prefix}user__lang_${suffix}`),
      };
    });

    expect(sessionStorage.device).toBe('e2e-device-0001');
    expect(sessionStorage.refresh).toBeNull();
    expect(sessionStorage.organization).toBe('epoca-e2e');
    expect(sessionStorage.language).toBe('pl');
    expect(sessionStorage.access?.user.organizationGrants).toEqual([
      { organizationId: '10000000-0000-4000-8000-000000000001', roles: ['Owner'] },
    ]);

    const payload = JSON.parse(Buffer.from(sessionStorage.access.token.split('.')[1], 'base64url').toString('utf8'));
    expect(payload).toMatchObject({
      id: '20000000-0000-4000-8000-000000000001',
      roles: [
        {
          organizationId: '10000000-0000-4000-8000-000000000001',
          roles: ['Owner'],
        },
      ],
    });

    const projects = await page.evaluate(async () => {
      const response = await fetch('/__e2e_api/organizations/epoca-e2e/projects?includeArchived=true');
      return response.json();
    });
    const projectUsers = projects.results.flatMap((project) => project.projectUsers);
    expect(projectUsers.filter(({ id }) => id === '20000000-0000-4000-8000-000000000001')).toEqual(
      expect.arrayContaining([expect.objectContaining({ isLoggedInUser: true })]),
    );
    expect(projectUsers.filter(({ id }) => id !== '20000000-0000-4000-8000-000000000001')).toEqual(
      expect.arrayContaining([expect.objectContaining({ isLoggedInUser: false })]),
    );
  });
});

test.describe('session containment', () => {
  test.use({ world: 'world-2', actor: 'owner' });

  test('auth containment @mr ignores stale organization failures after local logout', async ({ page, runtime }) => {
    let releaseOrganizations!: () => void;
    const organizationsRelease = new Promise<void>((resolve) => {
      releaseOrganizations = resolve;
    });
    let markOrganizationsRequested!: () => void;
    const organizationsRequested = new Promise<void>((resolve) => {
      markOrganizationsRequested = resolve;
    });
    const refreshRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/auth/refresh-token')) refreshRequests.push(request.url());
    });

    await page.route(
      '**/__e2e_api/organizations',
      async (route) => {
        markOrganizationsRequested();
        await organizationsRelease;
        await route.fulfill({
          body: JSON.stringify({ detail: 'stale session', status: 401, title: 'Unauthorized' }),
          contentType: 'application/problem+json',
          status: 401,
        });
      },
      { times: 1 },
    );

    await page.goto('/working-time');
    await organizationsRequested;
    try {
      await page.getByTestId('user-avatar-menu-button').click();
      await expect(page.getByTestId('user-avatar-menu-logout-button')).toBeVisible();
      await page.getByTestId('user-avatar-menu-logout-button').click();
      await expect(page).toHaveURL(/\/login$/);
    } finally {
      releaseOrganizations();
    }
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('loginEmailInput')).toBeVisible();
    await expect
      .poll(() => runtime.journal.entries.filter(({ path }) => path === '/auth/refresh-tokens/e2e-device-0001').length)
      .toBe(1);

    const storage = await page.evaluate(() => ({
      access: localStorage.getItem(`IteratorsEpoca__auth__access_tok_${window.location.hostname}`),
      refresh: localStorage.getItem(`IteratorsEpoca__auth__ref_tok_${window.location.hostname}`),
    }));
    expect(storage).toEqual({ access: null, refresh: null });
    expect(refreshRequests).toEqual([]);
  });
});
