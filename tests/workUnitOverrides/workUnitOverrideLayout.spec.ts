import { expect, reportUrl, test } from './fixtures/workUnitOverridesApi';

for (const width of [390, 702]) {
  test(`More contains and scrolls long worklog details at ${width}px`, async ({ page, overrideApi }) => {
    // More no longer lists the entry type, so the description carries enough text to exceed the panel height.
    overrideApi.source.description = `${overrideApi.source.description} ${'and a deliberately long explanation '.repeat(4).trim()}`;
    await page.setViewportSize({ width, height: 900 });
    await page.goto(reportUrl);
    await page.getByRole('button', { name: 'More', exact: true }).click();
    const panel = page.getByRole('group', { name: 'More', exact: true });
    await expect(panel).toBeVisible();
    expect(overrideApi.historyRequests).toEqual([]);
    const geometry = await panel.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        overflowY: getComputedStyle(element).overflowY,
        left: rect.left,
        right: rect.right,
        height: element.clientHeight,
        scrollHeight: element.scrollHeight,
        width: element.clientWidth,
        scrollWidth: element.scrollWidth,
      };
    });
    expect(geometry.overflowY).toBe('auto');
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(width);
    expect(geometry.scrollHeight).toBeGreaterThan(geometry.height);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width);
    await panel.getByText('Hours:', { exact: true }).scrollIntoViewIfNeeded();
    await expect(panel.getByText('Hours:', { exact: true })).toBeVisible();
    expect(await panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  });
}

for (const width of [390, 702, 1280]) {
  test(`history keeps long values readable inside the edit modal at ${width}px`, async ({ page, overrideApi }) => {
    const latestEntry = overrideApi.history[0];
    if (latestEntry.provenance !== 'WorkUnitOverride' || !latestEntry.before || !latestEntry.after)
      throw new Error('Expected a current correction fixture');
    const longClient = `Client with a long name ${'CONTRACT'.repeat(12)}`;
    const longProject = `Project with a long description ${'IMPLEMENTATION'.repeat(10)}`;
    const longTask = `TASK-${'IDENTIFIER'.repeat(18)}`;
    latestEntry.before.effective.projectClient = {
      clientId: latestEntry.before.source.projectClient!.clientId,
      clientName: `Original ${longClient}`,
      projectId: latestEntry.before.source.projectClient!.projectId,
      projectName: `Original ${longProject}`,
    };
    latestEntry.after.effective.projectClient = {
      clientId: latestEntry.after.effective.projectClient!.clientId,
      clientName: `Corrected ${longClient}`,
      projectId: latestEntry.after.effective.projectClient!.projectId,
      projectName: `Corrected ${longProject}`,
    };
    latestEntry.before.effective.taskId = `BEFORE-${longTask}`;
    latestEntry.after.effective.taskId = `AFTER-${longTask}`;
    await page.setViewportSize({ width, height: 900 });
    await page.goto(reportUrl);
    if (width < 1200) await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit report entry', exact: true });
    expect(overrideApi.historyRequests).toEqual([]);
    await dialog.getByRole('button', { name: 'Correction history', exact: true }).click();
    const history = dialog.getByRole('region', { name: 'Correction history', exact: true });
    await expect(history.locator('article')).toHaveCount(25);
    const description = dialog.getByRole('textbox', { name: 'Description of activities', exact: true });
    const descriptionScrollbar = await description.evaluate((element) => ({
      color: getComputedStyle(element).scrollbarColor,
      width: getComputedStyle(element).scrollbarWidth,
    }));
    expect(descriptionScrollbar.width).toBe('thin');
    expect(descriptionScrollbar.color).not.toBe('auto');
    const entries = history.getByRole('group', { name: 'History entries' });
    const overlay = dialog.locator('..');
    expect(
      await overlay.evaluate((element) => ({
        color: getComputedStyle(element).scrollbarColor,
        width: getComputedStyle(element).scrollbarWidth,
      })),
    ).toEqual(descriptionScrollbar);
    expect(await entries.evaluate((element) => getComputedStyle(element).overflowY)).toBe('visible');
    expect(await dialog.evaluate((element) => getComputedStyle(element).overflowY)).toBe('visible');
    expect(await overlay.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');
    const latest = history.locator('article').first();
    await expect(latest).toContainText('Alex Manager');
    await expect(latest.locator('tbody tr')).toHaveCount(3);
    await expect(latest).toContainText(`Original ${longClient}`);
    await expect(latest).toContainText(`Corrected ${longProject}`);
    await expect(latest).toContainText(`AFTER-${longTask}`);
    const values = await latest.locator('td').evaluateAll((elements) =>
      elements.map((element) => ({
        width: element.getBoundingClientRect().width,
        client: element.clientWidth,
        scroll: element.scrollWidth,
      })),
    );
    for (const value of values) {
      expect(value.width).toBeGreaterThan(90);
      expect(value.scroll).toBeLessThanOrEqual(value.client + 1);
    }
    expect(
      await latest
        .locator('table')
        .evaluate((element) => element.parentElement!.scrollWidth - element.parentElement!.clientWidth),
    ).toBeLessThanOrEqual(1);
    expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    expect(await description.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    expect(await overlay.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    expect(await overlay.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
    await overlay.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(await overlay.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await dialog.evaluate((element) => element.scrollTop)).toBe(0);
    const loadOlder = history.getByRole('button', { name: 'Load older changes', exact: true });
    await expect(loadOlder).toBeInViewport({ ratio: 1 });
    await loadOlder.click();
    await expect(history.locator('article')).toHaveCount(30);
    const lastEntry = history.locator('article').last();
    await lastEntry.scrollIntoViewIfNeeded();
    await expect(lastEntry).toBeInViewport();
    for (const control of [
      history.getByRole('button', { name: 'Retained changes', exact: true }),
      dialog.getByRole('button', { name: 'Update', exact: true }),
      dialog.getByRole('button', { name: 'Close', exact: true }),
    ]) {
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeInViewport({ ratio: 1 });
    }
    expect(await entries.evaluate((element) => element.scrollTop)).toBe(0);
  });
}

test.describe('empty correction history', () => {
  test.use({ historyDepth: 0 });
  test('disables history when no changes have been recorded', async ({ page, overrideApi }) => {
    await page.goto(reportUrl);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit report entry', exact: true });
    const history = dialog.getByRole('button', { name: 'Correction history', exact: true });
    await expect(history).toBeDisabled();
    await expect(history).toHaveAttribute('aria-expanded', 'false');
    expect(overrideApi.historyRequests).toEqual([]);
  });
});

test('shows application loaders during current-entry and history requests', async ({ page, overrideApi }) => {
  await page.goto(reportUrl);
  const releaseCurrent = overrideApi.holdNextCurrentRead();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit report entry', exact: true });
  const loading = dialog.getByRole('status');
  await expect(loading).toHaveAttribute('aria-busy', 'true');
  await expect(loading.locator('span').first()).toBeVisible();
  releaseCurrent();
  await expect(loading).toHaveCount(0);
  const releaseHistory = overrideApi.holdNextHistoryRead();
  await dialog.getByRole('button', { name: 'Correction history', exact: true }).click();
  await expect(loading).toHaveAttribute('aria-busy', 'true');
  await expect(loading.locator('span').first()).toBeVisible();
  releaseHistory();
  await expect(loading).toHaveCount(0);
  await expect(dialog.getByRole('region', { name: 'Correction history' }).locator('article')).toHaveCount(25);
});
