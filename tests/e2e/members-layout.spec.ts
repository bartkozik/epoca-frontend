import { expect, test } from './fixtures/epocaTest';
import { IDS } from './worlds/ids';

test.use({ world: 'world-4', actor: 'owner' });

for (const width of [320, 390, 600, 767, 768, 850, 1024, 1199, 1200, 1280, 1440]) {
  test(`@full members keep names, role and all actions readable at ${width}px`, async ({ page, runtime }) => {
    await page.setViewportSize({ width, height: 844 });
    const member = runtime.state.users.find(({ id }) => id === IDS.user)!;
    member.firstName = 'Aleksandra Katarzyna';
    member.lastName = 'Kowalska-Nowakowska';
    const name = `${member.firstName} ${member.lastName}`;
    await page.goto('/team-settings/members/list');
    const row = page.getByRole('row').filter({ hasText: name });
    const role = row.getByRole('combobox', { name: 'Rola użytkownika' });
    await expect(role).toHaveCount(1);
    await expect(row.getByRole('button', { name: 'Umowa', exact: true })).toHaveCount(0);
    const projects = row.getByRole('button', { name: 'Projekty', exact: true });
    await expect(projects).toBeVisible();
    const roleBox = (await role.boundingBox())!;
    const roleHeader = page.locator('thead th[data-th="User role"]');
    if (width >= 768) {
      await expect(roleHeader).toBeVisible();
      const headerBox = (await roleHeader.boundingBox())!;
      expect(Math.abs(roleBox.x - headerBox.x)).toBeLessThanOrEqual(2);
    } else {
      await expect(roleHeader).toBeHidden();
    }
    const tableBox = (await page.getByRole('table').boundingBox())!;
    const rowBox = (await row.boundingBox())!;
    expect(Math.abs(rowBox.width - tableBox.width)).toBeLessThanOrEqual(2);
    const actionBox = (await projects.boundingBox())!;
    const horizontalGap = actionBox.x - roleBox.x - roleBox.width;
    const verticalGap = actionBox.y - roleBox.y - roleBox.height;
    expect(Math.max(horizontalGap, verticalGap)).toBeGreaterThanOrEqual(20);
    const nameElement = row.getByText(name, { exact: true }).and(page.locator(':visible'));
    await expect(nameElement).toHaveCount(1);
    expect(await nameElement.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    for (const label of ['Projekty', 'Usuń']) {
      const action = row.getByRole('button', { name: label, exact: true });
      const box = (await action.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    await role.press('Enter');
    await expect(page.getByRole('listbox')).toBeVisible();
    await role.press('Escape');
    await role.press('Tab');
    await expect(projects).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(row.getByRole('button', { name: 'Usuń', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await row.getByRole('button', { name: 'Projekty', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/team-settings/members/list/${IDS.user}`));
  });
}

test('@mr members show API avatars and initials for missing or broken photos', async ({ page, runtime }) => {
  const member = runtime.state.users.find(({ id }) => id === IDS.user)!;
  member.avatar =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const owner = runtime.state.users.find(({ id }) => id === runtime.state.actors.owner?.userId)!;
  owner.avatar = undefined;
  const broken = runtime.state.users.find(({ id }) => id !== member.id && id !== owner.id)!;
  broken.avatar = 'data:image/png;base64,broken';
  await page.goto('/team-settings/members/list');
  const memberRow = page.getByRole('row').filter({ hasText: `${member.firstName} ${member.lastName}` });
  await expect(
    memberRow.getByRole('img', { name: `${member.firstName} ${member.lastName}`, exact: true }),
  ).toHaveAttribute('src', member.avatar);
  for (const user of [owner, broken]) {
    const row = page.getByRole('row').filter({ hasText: `${user.firstName} ${user.lastName}` });
    await expect(row).toBeVisible();
    await expect(row.getByRole('img', { name: `${user.firstName} ${user.lastName}`, exact: true })).toHaveCount(0);
    const initials = `${user.firstName} ${user.lastName}`
      .split(' ')
      .slice(0, 3)
      .map((part) => part[0])
      .join('');
    await expect(row.getByText(initials, { exact: true })).toBeVisible();
  }
});
