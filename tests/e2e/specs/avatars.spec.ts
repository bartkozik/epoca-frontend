import { createHash } from 'node:crypto';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures/epocaTest';
import { IDS } from '../worlds/ids';

const IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const hash = (email: string): string => createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

async function mockGravatar(page: Page, successEmail: string): Promise<string[]> {
  const requestedHashes: string[] = [];
  await page.route('https://gravatar.com/avatar/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const requestedHash = url.pathname.split('/').at(-1)!;
    requestedHashes.push(requestedHash);
    expect(requestedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.fromEntries(url.searchParams)).toEqual({ s: '96', r: 'g', d: '404' });
    expect((await request.allHeaders()).referer).toBeUndefined();
    await route.fulfill(
      requestedHash === hash(successEmail)
        ? { status: 200, contentType: 'image/png', body: Buffer.from(IMAGE, 'base64') }
        : { status: 404, body: '' },
    );
  });
  return requestedHashes;
}

test.use({ world: 'world-4', actor: 'owner' });

test('CT-582 @mr keeps avatars loading until a delayed photo or missing-photo response settles', async ({
  page,
  runtime,
}, testInfo) => {
  const regular = runtime.state.users.find(({ id }) => id === IDS.user)!;
  const manager = runtime.state.users.find(({ id }) => id === IDS.manager)!;
  regular.avatar = undefined;
  manager.avatar = undefined;
  let releasePhotos!: () => void;
  const photosReady = new Promise<void>((resolve) => {
    releasePhotos = resolve;
  });
  await page.route('https://gravatar.com/avatar/**', async (route) => {
    await photosReady;
    const successful = new URL(route.request().url()).pathname.endsWith(hash(regular.email));
    await route.fulfill(
      successful
        ? { status: 200, contentType: 'image/png', body: Buffer.from(IMAGE, 'base64') }
        : { status: 404, body: '' },
    );
  });

  try {
    await page.goto('/team-settings/members/list', { waitUntil: 'domcontentloaded' });
    const regularRow = page.getByRole('row').filter({ hasText: 'Regular User' });
    const managerRow = page.getByRole('row').filter({ hasText: 'Manager User' });
    const regularAvatar = regularRow.locator('[aria-busy]');
    const managerAvatar = managerRow.locator('[aria-busy]');
    const photo = regularRow.getByRole('img', { name: 'Regular User', exact: true });
    await expect(regularAvatar).toHaveAttribute('aria-busy', 'true');
    await expect(managerAvatar).toHaveAttribute('aria-busy', 'true');
    await expect(regularRow.getByText('RU', { exact: true })).toHaveCount(0);
    await expect(managerRow.getByText('MU', { exact: true })).toHaveCount(0);
    await expect(photo).toHaveCSS('opacity', '0');
    const loadingBounds = await regularAvatar.boundingBox();
    await testInfo.attach('avatar-loading', { body: await regularAvatar.screenshot(), contentType: 'image/png' });

    releasePhotos();
    await expect(regularAvatar).toHaveAttribute('aria-busy', 'false');
    await expect(photo).toHaveCSS('opacity', '1');
    await expect(regularRow.getByText('RU', { exact: true })).toHaveCount(0);
    await expect(managerAvatar).toHaveAttribute('aria-busy', 'false');
    await expect(managerRow.getByText('MU', { exact: true })).toBeVisible();
    expect(await regularAvatar.boundingBox()).toMatchObject({
      width: loadingBounds?.width,
      height: loadingBounds?.height,
    });
  } finally {
    releasePhotos();
  }
});

test('CT-582 @mr uses existing photos then Gravatar then initials and offers an external editor', async ({
  page,
  runtime,
}) => {
  const owner = runtime.state.users.find(({ id }) => id === IDS.owner)!;
  const regular = runtime.state.users.find(({ id }) => id === IDS.user)!;
  const manager = runtime.state.users.find(({ id }) => id === IDS.manager)!;
  const pm = runtime.state.users.find(({ id }) => id === IDS.pm)!;
  owner.avatar = `data:image/png;base64,${IMAGE}`;
  regular.avatar = 'data:image/png;base64,broken';
  manager.avatar = `data:image/png;base64,${IMAGE}`;
  pm.avatar = undefined;
  const invalid = runtime.state.users.find(({ firstName, lastName }) => firstName === 'Person' && lastName === '06')!;
  invalid.identities[0].value = 'Unknown';
  const requestedHashes = await mockGravatar(page, regular.email);

  await page.goto('/team-settings/members/list');
  const row = (name: string): Locator => page.getByRole('row').filter({ hasText: name });
  await expect(row('Owner User').getByRole('img', { name: 'Owner User', exact: true })).toHaveAttribute(
    'src',
    owner.avatar,
  );
  await expect(row('Regular User').getByRole('img', { name: 'Regular User', exact: true })).toHaveAttribute(
    'src',
    `https://gravatar.com/avatar/${hash(regular.email)}?s=96&r=g&d=404`,
  );
  await expect(row('Manager User').getByRole('img', { name: 'Manager User', exact: true })).toHaveAttribute(
    'src',
    manager.avatar,
  );
  await expect(row('Person 06').getByText('P0', { exact: true })).toBeVisible();
  await expect(row('Project Manager').getByText('PM', { exact: true })).toBeVisible();
  expect(requestedHashes).toContain(hash(regular.email));
  expect(requestedHashes).toContain(hash(pm.email));
  expect(requestedHashes).not.toContain(hash(manager.email));
  expect(requestedHashes).not.toContain(hash('Unknown'));

  await page.getByTestId('user-avatar-menu-button').click();
  const editor = page.getByRole('link', { name: 'Edytuj awatar w Gravatar (otwiera nową kartę)' });
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute('href', 'https://gravatar.com/profile/avatars');
  await expect(editor).toHaveAttribute('target', '_blank');
  await expect(editor).toHaveAttribute('rel', 'noopener noreferrer');
});

test('CT-582 @mr project avatars reuse authorized organization emails without profile lookups', async ({
  page,
  runtime,
}) => {
  const regular = runtime.state.users.find(({ id }) => id === IDS.user)!;
  await mockGravatar(page, regular.email);
  await page.goto(`/projects/${IDS.projectAlpha}/assigned-members`);
  const row = page.getByRole('row').filter({ hasText: 'Regular User' });
  await expect(row.getByRole('img', { name: 'Regular User', exact: true })).toHaveAttribute(
    'src',
    `https://gravatar.com/avatar/${hash(regular.email)}?s=96&r=g&d=404`,
  );
  expect(runtime.journal.entries.filter(({ path }) => path === `/users/${regular.id}`)).toHaveLength(0);
});
