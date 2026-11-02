import { chooseProject } from './fixtures/workUnitEditHelpers';
import { expect, ids, reportUrl, test } from './fixtures/workUnitOverridesApi';

test('mobile More keeps effective long values readable and exposes one pencil', async ({ page, overrideApi }) => {
  await page.goto(reportUrl);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  const panel = page.getByRole('group', { name: 'More' });
  await expect(panel).toContainText('Corrected Project With A Deliberately Long Name For Responsive Coverage');
  await expect(panel).toContainText('CORRECTED-OLD');
  await expect(panel).not.toContainText('SOURCE-17');
  const metrics = await panel.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.client);
  await panel.getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit report entry', exact: true });
  await expect(dialog.getByLabel('Task ID')).toHaveValue('CORRECTED-OLD');
  await expect(dialog.getByRole('button', { name: 'Correction and history', exact: true })).toHaveCount(0);
  for (const control of [
    dialog.getByRole('button', { name: 'Client and project', exact: true }),
    dialog.getByLabel('Task ID', { exact: true }),
  ]) {
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  await dialog.getByLabel('Task ID', { exact: true }).fill('');
  await dialog.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(dialog.getByText('Correction saved.', { exact: true })).toBeVisible();
  expect(overrideApi.requests.find(({ method }) => method === 'PUT')?.body).toEqual({
    expectedRevision: 40,
    projectId: ids.targetProject,
    taskId: { mode: 'Clear' },
  });
});

test('mobile badge touch is lazy and correction controls remain within the viewport', async ({ page, overrideApi }) => {
  await page.goto(reportUrl);
  const badge = page.getByRole('button', { name: 'Corrected', exact: true });
  await expect(badge).toBeVisible();
  expect(overrideApi.historyRequests).toEqual([]);
  await badge.tap();
  await expect(page.getByRole('tooltip')).toContainText('Alex Manager');
  expect(overrideApi.historyRequests).toHaveLength(1);
  const tooltip = await page.getByRole('tooltip').boundingBox();
  expect(tooltip!.x).toBeGreaterThanOrEqual(0);
  expect(tooltip!.x + tooltip!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await badge.tap();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('group', { name: 'More' }).getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit report entry', exact: true });
  await chooseProject(dialog, 'Overflow Project 20');
  await dialog.getByRole('button', { name: 'Correction history', exact: true }).click();
  const history = dialog.getByRole('region', { name: 'Correction history' });
  await expect(history.locator('ol > li')).toHaveCount(25);
  await history.getByRole('button', { name: 'Load older changes' }).scrollIntoViewIfNeeded();
  const box = await history.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await dialog.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(dialog.getByText('Correction saved.', { exact: true })).toBeVisible();
});

test('mobile full history keeps reverted cards and view controls inside the viewport', async ({
  page,
  overrideApi,
}) => {
  expect(overrideApi.history).toHaveLength(30);
  await page.goto(reportUrl);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('group', { name: 'More' }).getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit report entry', exact: true });
  await dialog.getByRole('button', { name: 'Correction history', exact: true }).click();
  const history = dialog.getByRole('region', { name: 'Correction history' });
  await history.getByRole('button', { name: 'Remove correction', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Remove the latest correction?', exact: true })
    .getByRole('button', { name: 'Remove correction', exact: true })
    .click();
  await history.getByRole('button', { name: 'All events', exact: true }).click();
  await expect(history.locator('article').first()).toContainText('Earlier values restored');
  await expect(history.locator('article').nth(1)).toContainText('Removed by Alex Manager');
  for (const element of [
    history,
    history.getByRole('button', { name: 'All events' }),
    history.locator('article').nth(1),
  ]) {
    const box = await element.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  const entries = history.getByRole('group', { name: 'History entries' });
  const overlay = dialog.locator('..');
  expect(await overlay.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');
  expect(await dialog.evaluate((element) => getComputedStyle(element).overflowY)).toBe('visible');
  const allEvents = history.getByRole('button', { name: 'All events', exact: true });
  const beforeScroll = await allEvents.boundingBox();
  await entries.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await entries.evaluate((element) => element.scrollTop)).toBe(0);
  await overlay.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await overlay.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await dialog.evaluate((element) => element.scrollTop)).toBe(0);
  const afterScroll = await allEvents.boundingBox();
  expect(afterScroll!.y).toBeLessThan(beforeScroll!.y);
  const lastEntry = history.locator('article').last();
  await lastEntry.scrollIntoViewIfNeeded();
  await expect(lastEntry).toBeInViewport();
  await allEvents.scrollIntoViewIfNeeded();
  await expect(allEvents).toBeInViewport({ ratio: 1 });
  await expect(allEvents).toBeEnabled();
  for (const control of [
    dialog.getByRole('button', { name: 'Update', exact: true }),
    dialog.getByRole('button', { name: 'Close', exact: true }),
  ]) {
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeInViewport({ ratio: 1 });
  }
  expect(await overlay.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  expect(await entries.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
});
