import { readFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import { chooseProject } from './fixtures/workUnitEditHelpers';
import { expect, ids, reportUrl, test } from './fixtures/workUnitOverridesApi';

export const rowFor = (page: Page): Locator => page.locator('tbody tr').filter({ hasText: 'Taylor Author' });
export async function openEdit(page: Page): Promise<Locator> {
  await page.goto(reportUrl);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit report entry', exact: true });
  await expect(dialog.getByLabel('Task ID', { exact: true })).toHaveValue('CORRECTED-OLD');
  return dialog;
}
const puts = (requests: { body: unknown; method: string; pathname: string }[]): typeof requests =>
  requests.filter(({ method, pathname }) => method === 'PUT' && pathname.endsWith('/override'));
const contrastRatio = (foreground: string, background: string): number => {
  const luminance = (color: string): number => {
    const channels = color
      .match(/\d+/g)!
      .slice(0, 3)
      .map((channel) => {
        const value = Number(channel) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};
const chooseTask = async (dialog: Locator, value: string): Promise<void> => {
  await dialog.getByLabel('Task ID', { exact: true }).fill(value);
};

test.describe('audited stepwise undo from the source value', () => {
  test.use({ historyDepth: 0 });

  test('source to A to second-manager B undoes B to A and A to source while showing only active corrections', async ({
    page,
    overrideApi,
  }) => {
    const originalSource = { ...overrideApi.source };
    await page.goto(reportUrl);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit report entry', exact: true });
    await expect(dialog.getByLabel('Task ID', { exact: true })).toHaveValue('SOURCE-17');

    await chooseTask(dialog, 'A');
    await dialog.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(dialog.getByText('Correction saved.', { exact: true })).toBeVisible();

    overrideApi.makeNextWriteBySecondManager();
    await chooseTask(dialog, 'B');
    await dialog.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(dialog.getByLabel('Task ID', { exact: true })).toHaveValue('B');

    await dialog.getByRole('button', { name: 'Correction history', exact: true }).click();
    const history = dialog.getByRole('region', { name: 'Correction history', exact: true });
    await expect(history.locator('article')).toHaveCount(2);
    await expect(history.locator('article').first().locator('header')).toContainText('Report values replaced');
    await expect(history.locator('article').first().locator('header')).toContainText('Currently applied');
    await expect(history.locator('article').nth(1).locator('header')).toContainText('Correction introduced');
    await expect(history.locator('article').nth(1).locator('header')).not.toContainText('Currently applied');
    await expect(history.locator('article').first()).toContainText('Morgan Second Manager');
    await expect(history.getByRole('button', { name: 'Remove correction', exact: true })).toHaveCount(1);
    await history.getByRole('button', { name: 'Remove correction', exact: true }).click();
    const firstConfirmation = page.getByRole('dialog', { name: 'Remove the latest correction?', exact: true });
    await expect(firstConfirmation).toContainText('Task ID: A');
    await firstConfirmation.getByRole('button', { name: 'Remove correction', exact: true }).click();
    await expect(dialog.getByLabel('Task ID', { exact: true })).toHaveValue('A');

    await expect(history.locator('article')).toHaveCount(1);
    await expect(history.locator('article').first().locator('header')).toContainText('Correction introduced');
    await expect(history.locator('article').first().locator('header')).toContainText('Currently applied');
    await expect(history.locator('article').first()).toContainText('Alex Manager');
    await expect(history.locator('article').first().locator('header time')).toHaveAttribute(
      'datetime',
      '2026-07-31T12:01:00.000Z',
    );
    await expect(history).not.toContainText('Morgan Second Manager');
    await expect(history).not.toContainText('Earlier values restored');
    const activeView = history.getByRole('button', { name: 'Retained changes', exact: true });
    const fullView = history.getByRole('button', { name: 'All events', exact: true });
    await expect(activeView).toHaveAttribute('aria-pressed', 'true');
    await fullView.focus();
    await page.keyboard.press('Enter');
    await expect(fullView).toHaveAttribute('aria-pressed', 'true');
    await expect(history.locator('article')).toHaveCount(3);
    await expect(history.locator('article').first()).toContainText('Earlier values restored');
    await expect(history.locator('article').first()).toContainText('Returned to the previous correction.');
    const revertedCard = history.locator('article').nth(1);
    await expect(revertedCard).toContainText('Report values replaced');
    await expect(revertedCard).toContainText('Removed by Alex Manager');
    await expect(revertedCard.getByText('Reverted', { exact: true })).toHaveCount(0);
    await expect(history.locator('article').nth(2).locator('header')).toContainText('Correction introduced');
    await expect(history.locator('article').nth(2).locator('header')).toContainText('Currently applied');
    const cardStyles = await history.locator('article').evaluateAll((cards) =>
      cards.map((card) => ({
        background: getComputedStyle(card).backgroundColor,
        color: getComputedStyle(card).color,
        leftBorder: Number.parseFloat(getComputedStyle(card).borderLeftWidth),
      })),
    );
    expect(cardStyles[0].background).toBe(cardStyles[1].background);
    expect(cardStyles[0].background).not.toBe(cardStyles[2].background);
    expect(cardStyles[0].color).toBe(cardStyles[1].color);
    expect(cardStyles[0].color).not.toBe(cardStyles[2].color);
    expect(cardStyles[0].leftBorder).toBeLessThanOrEqual(2);
    expect(cardStyles[1].leftBorder).toBeLessThanOrEqual(2);
    expect(contrastRatio(cardStyles[1].color, cardStyles[1].background)).toBeGreaterThanOrEqual(7);
    const normalCardStyles = await revertedCard.evaluate((card) => ({
      background: getComputedStyle(card).backgroundColor,
      color: getComputedStyle(card).color,
      border: getComputedStyle(card).borderColor,
      text: Array.from(card.querySelectorAll('header strong, th, td')).map(
        (element) => getComputedStyle(element).color,
      ),
    }));
    await revertedCard.hover();
    const hoverCardStyles = await revertedCard.evaluate((card) => ({
      background: getComputedStyle(card).backgroundColor,
      color: getComputedStyle(card).color,
      border: getComputedStyle(card).borderColor,
      text: Array.from(card.querySelectorAll('header strong, th, td')).map(
        (element) => getComputedStyle(element).color,
      ),
    }));
    expect(hoverCardStyles.background).toBe(normalCardStyles.background);
    expect(hoverCardStyles.color).toBe(normalCardStyles.color);
    expect(hoverCardStyles.text).toEqual(normalCardStyles.text);
    expect(hoverCardStyles.border).not.toBe(normalCardStyles.border);
    const activeCard = history.locator('article').nth(2);
    const activeTextBefore = await activeCard.evaluate((card) => ({
      color: getComputedStyle(card).color,
      text: Array.from(card.querySelectorAll('header strong, th, td')).map(
        (element) => getComputedStyle(element).color,
      ),
    }));
    await activeCard.hover();
    expect(
      await activeCard.evaluate((card) => ({
        color: getComputedStyle(card).color,
        text: Array.from(card.querySelectorAll('header strong, th, td')).map(
          (element) => getComputedStyle(element).color,
        ),
      })),
    ).toEqual(activeTextBefore);
    const emphasizedColors = await revertedCard.locator('strong, th').evaluateAll((elements) =>
      elements.map((element) => ({
        color: getComputedStyle(element).color,
        background: getComputedStyle(element.closest('article')!).backgroundColor,
      })),
    );
    expect(emphasizedColors.length).toBeGreaterThan(0);
    for (const { color, background } of emphasizedColors) {
      expect(contrastRatio(color, background)).toBeGreaterThanOrEqual(10);
    }
    await expect(revertedCard.locator('time').last()).toHaveAttribute('datetime', '2026-07-31T12:03:00.000Z');
    await expect(revertedCard.getByRole('button', { name: 'Remove correction' })).toHaveCount(0);
    await activeView.focus();
    await page.keyboard.press('Space');
    await expect(activeView).toHaveAttribute('aria-pressed', 'true');
    await expect(history.locator('article')).toHaveCount(1);
    await expect(history.getByRole('button', { name: 'Remove correction', exact: true })).toHaveCount(1);
    await history.getByRole('button', { name: 'Remove correction', exact: true }).click();
    const secondConfirmation = page.getByRole('dialog', { name: 'Remove the latest correction?', exact: true });
    await expect(secondConfirmation).toContainText('Task ID: SOURCE-17');
    await secondConfirmation.getByRole('button', { name: 'Remove correction', exact: true }).click();

    await expect(dialog.getByLabel('Task ID', { exact: true })).toHaveValue('SOURCE-17');
    await expect(history.getByRole('button', { name: 'Remove correction', exact: true })).toHaveCount(0);
    await expect(history.locator('article')).toHaveCount(0);
    await expect(history).toContainText('No retained changes.');
    await fullView.click();
    await expect(history.locator('article').first()).toContainText('Earlier values restored');
    await expect(history.locator('article').first()).toContainText('Returned to the original entry.');
    expect(
      overrideApi.requests
        .filter(({ method, pathname }) => method === 'POST' && pathname.endsWith('/override/undo'))
        .map(({ body }) => body),
    ).toEqual([
      { expectedRevision: 42, targetEventId: '00000070-0000-4000-8000-000000000002' },
      { expectedRevision: 43, targetEventId: '00000070-0000-4000-8000-000000000001' },
    ]);
    expect(overrideApi.requests.filter(({ method }) => method === 'DELETE')).toEqual([]);
    expect(overrideApi.source).toEqual(originalSource);
    expect(overrideApi.state).toMatchObject({ active: false, revision: 44, version: 4, taskId: { mode: 'Inherit' } });
  });
});

test.describe('audited undo branching', () => {
  test.use({ historyDepth: 3 });

  test('undo C then D creates a new branch and three consecutive undos end at source', async ({
    page,
    overrideApi,
  }) => {
    const originalSource = { ...overrideApi.source };
    await page.goto(reportUrl);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit report entry', exact: true });
    await expect(dialog.getByLabel('Task ID', { exact: true })).toHaveValue('CORRECTED-3');
    await dialog.getByRole('button', { name: 'Correction history', exact: true }).click();
    const history = dialog.getByRole('region', { name: 'Correction history', exact: true });
    const undoLatest = async (expectedTaskId: string): Promise<void> => {
      const action = history.getByRole('button', { name: 'Remove correction', exact: true });
      await expect(action).toHaveCount(1);
      await action.click();
      await page
        .getByRole('dialog', { name: 'Remove the latest correction?', exact: true })
        .getByRole('button', { name: 'Remove correction', exact: true })
        .click();
      await expect(dialog.getByLabel('Task ID', { exact: true })).toHaveValue(expectedTaskId);
    };

    await undoLatest('CORRECTED-2');
    await chooseTask(dialog, 'D');
    await dialog.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(dialog.getByLabel('Task ID', { exact: true })).toHaveValue('D');
    await undoLatest('CORRECTED-2');
    await undoLatest('CORRECTED-1');
    await undoLatest('SOURCE-17');

    expect(
      overrideApi.requests
        .filter(({ method, pathname }) => method === 'POST' && pathname.endsWith('/override/undo'))
        .map(({ body }) => body),
    ).toEqual([
      { expectedRevision: 40, targetEventId: '00000070-0000-4000-8000-000000000003' },
      { expectedRevision: 42, targetEventId: '00000070-0000-4000-8000-000000000005' },
      { expectedRevision: 43, targetEventId: '00000070-0000-4000-8000-000000000002' },
      { expectedRevision: 44, targetEventId: '00000070-0000-4000-8000-000000000001' },
    ]);
    expect(overrideApi.history.find(({ id }) => id.endsWith('000000000003'))?.revertsEventId).toBeNull();
    expect(overrideApi.source).toEqual(originalSource);
    expect(overrideApi.state).toMatchObject({ active: false, revision: 45, version: 8, taskId: { mode: 'Inherit' } });
  });
});

test('manager corrects effective values while preserving the original entry', async ({ page, overrideApi }) => {
  const before = { ...overrideApi.source };
  const dialog = await openEdit(page);
  await expect(dialog.getByRole('region', { name: 'Original entry · read only' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Correction and history', exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel('Selected date', { exact: true })).toHaveAttribute('readonly');
  await expect(dialog.getByRole('button', { name: 'Original entry', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'PM Filters' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Classify' })).toHaveCount(0);
  await chooseProject(dialog, 'Alternate Client Project');
  await dialog.getByLabel('Task ID', { exact: true }).fill('');
  await dialog.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(dialog.getByText('Correction saved.', { exact: true })).toBeVisible();
  await dialog.getByLabel('Task ID', { exact: true }).fill('SOURCE-17');
  await dialog.getByRole('button', { name: 'Update', exact: true }).click();
  expect(puts(overrideApi.requests).map(({ body }) => body)).toEqual([
    { expectedRevision: 40, projectId: ids.alternateClientProject, taskId: { mode: 'Clear' } },
    { expectedRevision: 41, projectId: ids.alternateClientProject, taskId: { mode: 'Inherit' } },
  ]);
  expect(overrideApi.source).toEqual(before);
  expect(overrideApi.requests.filter(({ method }) => method === 'PATCH')).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(rowFor(page).locator('[data-th="Client"]')).toHaveText('Alternate Client');
  await expect(rowFor(page).locator('[data-th="Project"]')).toHaveText('Alternate Client Project');
  await expect(rowFor(page).locator('[data-th="Task ID"]')).toHaveText('SOURCE-17');
});

test('revoked current access closes correction UI but retains ordinary effective report values', async ({
  page,
  overrideApi,
}) => {
  await page.goto(reportUrl);
  const edit = rowFor(page).getByRole('button', { name: 'Edit', exact: true });
  await expect(edit).toBeEnabled();
  overrideApi.revokeAccess();
  await edit.click();
  await expect.poll(() => overrideApi.requests.some(({ pathname }) => pathname.endsWith('/override'))).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(rowFor(page).locator('[data-th="Task ID"]')).toHaveText('CORRECTED-OLD');
  await expect(rowFor(page).getByRole('button', { name: 'Edit', exact: true })).toBeDisabled();
  expect(overrideApi.historyRequests).toEqual([]);
});

test('ordinary effective filters retire only legacy PM URL keys', async ({ page, overrideApi }) => {
  await page.goto(
    `${reportUrl}&projects=${ids.targetProject}&pmFilters=true&pmProjects=old&pmClients=old&sentinel=keep`,
  );
  await expect(rowFor(page)).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.has('pmFilters')).toBe(false);
  const params = new URL(page.url()).searchParams;
  expect(params.get('projects')).toBe(ids.targetProject);
  expect(params.get('startDate')).toBe('2026-07-28');
  expect(params.get('endDate')).toBe('2026-07-31');
  expect(params.get('sentinel')).toBe('keep');
  expect(params.has('pmProjects') || params.has('pmClients')).toBe(false);
  await page.goto(`${reportUrl}&projects=${ids.sourceProject}`);
  await expect(rowFor(page)).toHaveCount(0);
  expect(overrideApi.requests.some(({ pathname }) => pathname.includes('pm-classification'))).toBe(false);
});

test('effective CSV export uses exactly ten columns and selected identifiers', async ({ page, overrideApi }) => {
  await page.goto(reportUrl);
  await rowFor(page).getByRole('checkbox').locator('xpath=following-sibling::span').click({ force: true });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const downloadPath = await (await downloadPromise).path();
  const csv = await readFile(downloadPath, 'utf8');
  expect(csv).toContain('Corrected Client');
  expect(csv).toContain('CORRECTED-OLD');
  expect(csv).not.toContain('SOURCE-17');
  expect(csv).not.toContain('PM Task ID');
  const body = overrideApi.exports[0] as { columnNames: Record<string, string>; ids: string[] };
  expect(Object.keys(body.columnNames)).toHaveLength(10);
  expect(body.ids).toEqual([ids.unit]);
});

test('history opens lazily and paginates two actors against one immutable snapshot', async ({ page, overrideApi }) => {
  const chronological = [...overrideApi.history].reverse();
  expect(chronological.map(({ version }) => version)).toEqual(Array.from({ length: 30 }, (_, index) => index + 1));
  chronological.forEach((entry, index) => {
    if (entry.provenance !== 'WorkUnitOverride') throw new Error('controlled history must use current provenance');
    if (index === 0) {
      expect(entry.before).toMatchObject({
        projectId: null,
        taskIdOverrideSet: false,
        taskId: { mode: 'Inherit' },
      });
    } else {
      const previous = chronological[index - 1];
      if (previous.provenance !== 'WorkUnitOverride') throw new Error('controlled history must be continuous');
      expect(entry.before).toEqual(previous.after);
    }
    for (const value of [entry.before, entry.after]) {
      expect(value.source).toMatchObject({
        projectClient: { projectId: ids.sourceProject },
        taskId: overrideApi.source.taskId,
      });
      expect(value.effective.projectClient?.projectId).toBe(value.projectId ?? ids.sourceProject);
      expect(value.taskIdOverrideSet).toBe(value.taskId.mode !== 'Inherit');
      const effectiveTaskId =
        value.taskId.mode === 'Set'
          ? value.taskId.value
          : value.taskId.mode === 'Clear'
            ? null
            : overrideApi.source.taskId;
      expect(value.effective.taskId).toBe(effectiveTaskId);
    }
  });
  expect(chronological.at(-1)?.after).toMatchObject({
    projectId: overrideApi.state.projectId,
    taskId: overrideApi.state.taskId,
  });

  const dialog = await openEdit(page);
  expect(overrideApi.historyRequests).toEqual([]);
  await dialog.getByRole('button', { name: 'Correction history', exact: true }).click();
  const history = dialog.getByRole('region', { name: 'Correction history' });
  await expect(history.locator('ol > li')).toHaveCount(25);
  await expect(history).toContainText('Alex Manager');
  await expect(history).toContainText('Morgan Second Manager');
  await history.getByRole('button', { name: 'Load older changes' }).click();
  await expect(history.locator('ol > li')).toHaveCount(30);
  expect(overrideApi.historyRequests.map(({ searchParams }) => Object.fromEntries(searchParams))).toEqual([
    { upToVersion: '30', pageSize: '25', pageNumber: '1' },
    { upToVersion: '30', pageSize: '25', pageNumber: '2' },
  ]);
});

test('shows only active corrections after repeated undo and offers one latest action', async ({
  page,
  overrideApi,
}) => {
  overrideApi.buryUndoCandidateOnOlderPage();
  await page.goto(reportUrl);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit report entry', exact: true });
  await expect(dialog.getByLabel('Task ID', { exact: true })).toHaveValue('CORRECTED-17');
  await dialog.getByRole('button', { name: 'Correction history', exact: true }).click();
  const history = dialog.getByRole('region', { name: 'Correction history', exact: true });
  await expect(history.locator('article')).toHaveCount(17);
  await expect(history.getByRole('button', { name: 'Remove correction', exact: true })).toHaveCount(1);
  await expect(history.getByRole('button', { name: 'Load older changes', exact: true })).toHaveCount(0);
  await expect(history.getByRole('button', { name: 'Remove correction', exact: true })).toHaveCount(1);
});

test('stale 409 compares current and proposed values and requires explicit reapply', async ({ page, overrideApi }) => {
  const dialog = await openEdit(page);
  await chooseTask(dialog, 'MY-DRAFT');
  overrideApi.makeNextWriteStale();
  await dialog.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Review changed entry' })).toBeVisible();
  await expect(dialog).toContainText('SERVER-WON');
  await expect(dialog).toContainText('MY-DRAFT');
  expect(puts(overrideApi.requests)).toHaveLength(1);
  await expect(dialog.getByRole('button', { name: 'Update', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Review and reapply' }).click();
  expect(puts(overrideApi.requests)).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(dialog.getByText('Correction saved.', { exact: true })).toBeVisible();
  expect(puts(overrideApi.requests).map(({ body }) => body)).toEqual([
    { expectedRevision: 40, projectId: ids.targetProject, taskId: { mode: 'Set', value: 'MY-DRAFT' } },
    { expectedRevision: 41, projectId: ids.targetProject, taskId: { mode: 'Set', value: 'MY-DRAFT' } },
  ]);
});

test('reconciles an accepted undo after a lost response without replaying the POST', async ({ page, overrideApi }) => {
  const dialog = await openEdit(page);
  await dialog.getByRole('button', { name: 'Correction history', exact: true }).click();
  overrideApi.makeNextUndoOutcome('accepted');
  await dialog.getByRole('button', { name: 'Remove correction', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Remove the latest correction?', exact: true })
    .getByRole('button', { name: 'Remove correction', exact: true })
    .click();
  await expect(dialog.getByLabel('Task ID', { exact: true })).toHaveValue('CORRECTED-29');
  expect(
    overrideApi.requests.filter(({ method, pathname }) => method === 'POST' && pathname.endsWith('/override/undo')),
  ).toHaveLength(1);
  // 3, not 2: React StrictMode's dev-only double-invoke of the mount effect fires two overlapping
  // loadFresh() calls for the exact same query key, plus one more for the reconciliation reload.
  // loadFresh cancels any query already in flight under that key before issuing its own fetchQuery
  // (see useWorkUnitOverride.ts's loadFresh) so a genuinely abandoned session (e.g. a fast
  // close+reopen of the same work unit) can never adopt another session's stale in-flight
  // response -- this also disables fetchQuery's dedup of StrictMode's benign double mount, which
  // is a dev-only cost, not a production regression.
  expect(
    overrideApi.requests.filter(({ method, pathname }) => method === 'GET' && pathname.endsWith('/override')),
  ).toHaveLength(3);
  expect(overrideApi.historyRequests.length).toBeGreaterThan(2);
  expect(overrideApi.historyRequests.some(({ searchParams }) => searchParams.get('upToVersion') === '31')).toBe(true);
  await expect(dialog.getByRole('heading', { name: 'Review changed entry' })).toHaveCount(0);
});

test('keeps unrecorded and unknown undo outcomes explicit without automatic replay', async ({ page, overrideApi }) => {
  const dialog = await openEdit(page);
  await dialog.getByRole('button', { name: 'Correction history', exact: true }).click();
  const undo = dialog.getByRole('button', { name: 'Remove correction', exact: true });
  overrideApi.makeNextUndoOutcome('not-recorded');
  await undo.click();
  await page
    .getByRole('dialog', { name: 'Remove the latest correction?', exact: true })
    .getByRole('button', { name: 'Remove correction', exact: true })
    .click();
  await expect(dialog.getByRole('heading', { name: 'Review changed entry' })).toBeVisible();
  await expect(dialog.getByLabel('Task ID', { exact: true })).toHaveValue('CORRECTED-OLD');
  await dialog.getByRole('button', { name: 'Use current values', exact: true }).click();

  overrideApi.makeNextUndoOutcome('unknown');
  await dialog.getByRole('button', { name: 'Remove correction', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Remove the latest correction?', exact: true })
    .getByRole('button', { name: 'Remove correction', exact: true })
    .click();
  await expect(dialog).toContainText('The save result could not be confirmed.');
  await expect(dialog.getByRole('heading', { name: 'Review changed entry' })).toHaveCount(0);
  expect(
    overrideApi.requests.filter(({ method, pathname }) => method === 'POST' && pathname.endsWith('/override/undo')),
  ).toHaveLength(2);
  expect(overrideApi.state).toMatchObject({
    revision: 40,
    version: 30,
    taskId: { mode: 'Set', value: 'CORRECTED-OLD' },
  });
});

test('stale undo shows the concurrent correction and never retries automatically', async ({ page, overrideApi }) => {
  const dialog = await openEdit(page);
  await dialog.getByRole('button', { name: 'Correction history', exact: true }).click();
  overrideApi.makeNextWriteStale();
  await dialog.getByRole('button', { name: 'Remove correction', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Remove the latest correction?', exact: true })
    .getByRole('button', { name: 'Remove correction', exact: true })
    .click();
  await expect(dialog.getByRole('heading', { name: 'Review changed entry' })).toBeVisible();
  await expect(dialog).toContainText('SERVER-WON');
  expect(
    overrideApi.requests
      .filter(({ method, pathname }) => method === 'POST' && pathname.endsWith('/override/undo'))
      .map(({ body }) => body),
  ).toEqual([{ expectedRevision: 40, targetEventId: '00000070-0000-4000-8000-000000000030' }]);
});

test('dirty standard form disables the history-card undo action without sending a mutation', async ({
  page,
  overrideApi,
}) => {
  const dialog = await openEdit(page);
  await dialog.getByRole('button', { name: 'Correction history', exact: true }).click();
  await chooseTask(dialog, 'UNSAVED');
  const undo = dialog.getByRole('button', { name: 'Remove correction', exact: true });
  await expect(undo).toBeDisabled();
  await expect(dialog).toContainText('Save or discard the unsaved form changes first.');
  expect(
    overrideApi.requests.filter(({ method, pathname }) => method === 'POST' && pathname.endsWith('/override/undo')),
  ).toEqual([]);
});

test('latest history card confirmation keeps nested focus and removes exactly one correction', async ({
  page,
  overrideApi,
}) => {
  const dialog = await openEdit(page);
  await dialog.getByRole('button', { name: 'Correction history', exact: true }).click();
  const history = dialog.getByRole('region', { name: 'Correction history', exact: true });
  const undo = history.getByRole('button', { name: 'Remove correction', exact: true });
  await expect(undo).toHaveCount(1);
  await undo.click();
  const confirmation = page.getByRole('dialog', { name: 'Remove the latest correction?', exact: true });
  await expect(confirmation).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await confirmation.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  expect(
    overrideApi.requests.filter(({ method, pathname }) => method === 'POST' && pathname.endsWith('/override/undo')),
  ).toEqual([]);
  await undo.click();
  await confirmation.getByRole('button', { name: 'Remove correction', exact: true }).click();
  await expect(dialog.getByText('Correction saved.', { exact: true })).toBeVisible();
  expect(overrideApi.state).toMatchObject({
    active: true,
    revision: 41,
    version: 31,
    taskId: { mode: 'Set', value: 'CORRECTED-29' },
  });
  expect(overrideApi.history[0]).toMatchObject({
    operation: 'Undo',
    provenance: 'WorkUnitOverride',
    revertsEventId: '00000070-0000-4000-8000-000000000030',
  });
  await expect(history.locator('article').first()).toContainText('CORRECTED-29');
  await expect(history.getByRole('button', { name: 'Remove correction', exact: true })).toHaveCount(1);
  await expect(history).not.toContainText('Earlier values restored');
  await expect(history).not.toContainText('Removed by Alex Manager');
  expect(overrideApi.requests.filter(({ method }) => method === 'DELETE')).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Corrected', exact: true })).toBeVisible();
  await expect(rowFor(page).locator('[data-th="Task ID"]')).toHaveText('CORRECTED-29');
});

test('dirty correction close is guarded and discard does not send a write', async ({ page, overrideApi }) => {
  const dialog = await openEdit(page);
  await chooseTask(dialog, 'UNSAVED');
  await page.keyboard.press('Escape');
  const confirmation = page.getByRole('dialog').filter({ hasText: 'Discard unsaved changes?' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog.getByLabel('Task ID', { exact: true })).toHaveValue('UNSAVED');
  await page.keyboard.press('Escape');
  await confirmation.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(puts(overrideApi.requests)).toEqual([]);
});

test('project catalog and history stay bounded for long labels', async ({ page, overrideApi }) => {
  const dialog = await openEdit(page);
  const project = dialog.getByRole('button', { name: 'Client and project', exact: true });
  await project.click();
  await expect(dialog.getByText(/^Overflow Project \d+$/)).toHaveCount(20);
  expect(overrideApi.catalogProjects.length).toBe(26);
  await dialog.getByText('Overflow Project 20', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Correction history', exact: true }).click();
  const history = dialog.getByRole('region', { name: 'Correction history' });
  const entries = history.getByRole('group', { name: 'History entries' });
  await expect(history.locator('article').first()).toBeVisible();
  const entriesMetrics = await entries.evaluate((element) => ({
    overflow: getComputedStyle(element).overflowY,
    maxHeight: getComputedStyle(element).maxHeight,
  }));
  const overlay = dialog.locator('..');
  const overlayMetrics = await overlay.evaluate((element) => ({
    height: element.clientHeight,
    scroll: element.scrollHeight,
    overflow: getComputedStyle(element).overflowY,
  }));
  expect(entriesMetrics.overflow).toBe('visible');
  expect(entriesMetrics.maxHeight).toBe('none');
  expect(overlayMetrics.scroll).toBeGreaterThan(overlayMetrics.height);
  expect(overlayMetrics.overflow).toBe('auto');
  expect(await dialog.evaluate((element) => getComputedStyle(element).overflowY)).toBe('visible');
  expect(await overlay.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  const lastEntry = history.locator('article').last();
  await lastEntry.scrollIntoViewIfNeeded();
  await expect(lastEntry).toBeInViewport();
  await project.scrollIntoViewIfNeeded();
  await expect(project).toBeInViewport({ ratio: 1 });
  await expect(entries.getByRole('button', { name: 'Retained changes', exact: true })).toHaveCount(0);
  const box = await project.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('report pencil remains inside Actions and outside Hours', async ({ page, overrideApi }) => {
  expect(overrideApi.state.active).toBe(true);
  await page.goto(reportUrl);
  const row = rowFor(page);
  const [button, actions, hours] = await Promise.all([
    row.getByRole('button', { name: 'Edit', exact: true }).boundingBox(),
    row.locator('[data-th="Actions"]').boundingBox(),
    row.locator('[data-th="Hours"]').boundingBox(),
  ]);
  expect(button!.x).toBeGreaterThanOrEqual(actions!.x);
  expect(button!.x + button!.width).toBeLessThanOrEqual(actions!.x + actions!.width);
  expect(button!.x).toBeGreaterThanOrEqual(hours!.x + hours!.width);
});

test('CT-565 badge hover and focus lazily load a bounded snapshot and invalidate after revision', async ({
  page,
  overrideApi,
}) => {
  await page.goto(reportUrl);
  await expect(rowFor(page)).toBeVisible();
  expect(overrideApi.historyRequests).toEqual([]);
  const badge = page.getByRole('button', { name: 'Corrected', exact: true });
  await badge.hover();
  await expect(page.getByRole('tooltip')).toContainText('Alex Manager');
  expect(overrideApi.historyRequests).toHaveLength(1);
  await page.mouse.move(0, 0);
  await badge.focus();
  await expect(page.getByRole('tooltip')).toContainText('Alex Manager');
  expect(overrideApi.historyRequests).toHaveLength(2);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit report entry', exact: true });
  await chooseTask(dialog, 'REVISION-NEW');
  await dialog.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(dialog.getByText('Correction saved.', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await badge.hover();
  await expect(page.getByRole('tooltip')).toContainText('REVISION-NEW');
  expect(overrideApi.historyRequests).toHaveLength(3);
  expect(overrideApi.historyRequests.at(-1)?.searchParams.get('upToVersion')).toBe('31');
});

test('late current and history responses cannot restore a closed report session', async ({ page, overrideApi }) => {
  await page.goto(reportUrl);
  const release = overrideApi.holdNextCurrentRead();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByText('Loading current entry…')).toBeVisible();
  await page.keyboard.press('Escape');
  release();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit report entry', exact: true });
  await expect(dialog.getByLabel('Task ID')).toHaveValue('CORRECTED-OLD');
  const releaseHistory = overrideApi.holdNextHistoryRead();
  await dialog.getByRole('button', { name: 'Correction history', exact: true }).click();
  await expect.poll(() => overrideApi.historyRequests.length).toBe(1);
  await page.keyboard.press('Escape');
  releaseHistory();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Correction history' })).toHaveCount(0);
});

test('organization departure invalidates a delayed correction response without leaking the old session', async ({
  page,
  overrideApi,
}) => {
  await page.goto(reportUrl);
  const release = overrideApi.holdNextCurrentRead();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByText('Loading current entry…')).toBeVisible();
  // Trigger the real workspace-checkout handler directly because the open modal intentionally traps
  // user focus. This case exercises session invalidation during the pending GET, not click-through UX.
  await page.getByTestId('user-avatar-menu-button').evaluate((button: HTMLButtonElement) => button.click());
  await page
    .getByRole('button', { name: 'Change workspace', exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page).toHaveURL(/\/select-organization$/);
  release();
  await expect(page.getByRole('dialog', { name: 'Edit report entry', exact: true })).toHaveCount(0);
  await expect(page.getByText('CORRECTED-OLD', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Other Workspace', { exact: true })).toBeVisible();
});
