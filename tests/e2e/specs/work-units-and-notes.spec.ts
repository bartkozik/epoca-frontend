import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/epocaTest';
import { openWorkUnitForm } from '../support/navigation';

const WORK_UNITS_PATH = '/organizations/epoca-e2e/work-units';

interface WorkUnitFormData {
  date: string;
  description: string;
  duration?: string;
  taskId?: string;
}

const displayDate = (date: string): string => date.split('-').reverse().join('.');

const selectAlphaProject = async (page: Page): Promise<void> => {
  await page.getByLabel('Klienci i projekty', { exact: true }).click();
  await page.getByLabel('Modal', { exact: true }).getByText('Alpha Project', { exact: true }).click();
};

const fillCommonWorkUnitFields = async (page: Page, { date, description, taskId }: WorkUnitFormData): Promise<void> => {
  await selectAlphaProject(page);
  const selectedDate = page.getByLabel('Wybrana data', { exact: true });
  await selectedDate.fill(displayDate(date));
  await selectedDate.press('Enter');
  await page.getByText('Opis działań', { exact: true }).locator('..').getByRole('textbox').fill(description);

  if (taskId) {
    await page.getByLabel('ID zadania', { exact: true }).fill(taskId);
  }
};

const submitNote = async (page: Page, data: WorkUnitFormData): Promise<void> => {
  await openWorkUnitForm(page);
  await page
    .getByRole('group', { name: 'Co chcesz dodać?', exact: true })
    .getByRole('button', { name: 'Notatka', exact: true })
    .click();
  await fillCommonWorkUnitFields(page, data);

  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/work-units'),
  );
  await page.getByRole('button', { name: 'Złóż raport', exact: true }).click();
  expect((await responsePromise).status()).toBe(201);
};

const fillWorklogForm = async (page: Page, data: WorkUnitFormData): Promise<void> => {
  await openWorkUnitForm(page);
  await page
    .getByRole('group', { name: 'Co chcesz dodać?', exact: true })
    .getByRole('button', { name: 'Czas pracy', exact: true })
    .click();
  await fillCommonWorkUnitFields(page, data);
  await page.getByLabel('Godziny', { exact: true }).fill(data.duration ?? '');
};

test.use({ world: 'world-5', actor: 'user' });

test('CT-508 CT-509 @mr saves past and future notes and excludes them from totals', async ({ page, runtime }) => {
  await page.goto('/working-time');
  await expect(page.getByText('Suma: 08:00', { exact: true })).toBeVisible();

  await submitNote(page, { date: '2026-07-14', description: 'Notatka przeszła E2E' });
  await submitNote(page, { date: '2026-07-16', description: 'Notatka przyszła E2E' });

  const created = runtime.state.workUnits.filter(({ description }) => description.endsWith('E2E'));
  expect(created).toHaveLength(2);
  expect(created.map(({ date }) => date).sort()).toEqual(['2026-07-14', '2026-07-16']);
  expect(created.every(({ duration, entryType }) => entryType === 'Note' && duration === 'PT0S')).toBe(true);
  const posts = runtime.journal.entries.filter(({ method, path }) => method === 'POST' && path === WORK_UNITS_PATH);
  expect(posts).toHaveLength(2);
  expect(
    posts.every(
      ({ requestBody }) =>
        requestBody !== null &&
        typeof requestBody === 'object' &&
        !Object.prototype.hasOwnProperty.call(requestBody, 'duration'),
    ),
  ).toBe(true);
  await expect(page.getByText('Notatka przeszła E2E', { exact: true })).toBeVisible();
  await expect(page.getByText('Notatka przyszła E2E', { exact: true })).toBeVisible();
  await expect(page.getByText('Legacy past note', { exact: true })).toBeVisible();
  await expect(page.getByText('Suma: 08:00', { exact: true })).toBeVisible();

  // The report lists worklogs only; notes stay in the calendar.
  await page.goto('/report?startDate=2026-07-01&endDate=2026-07-31');
  await expect(page.getByRole('row', { name: /Task ID worklog/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Precyzyjne godziny/ })).toBeVisible();
  for (const note of ['Notatka przeszła E2E', 'Notatka przyszła E2E', 'Legacy past note', 'Legacy future note']) {
    await expect(page.getByText(note, { exact: true })).toHaveCount(0);
  }
});

test.describe('lost response retry', () => {
  test.use({ failure: 'network-drop' });

  test('CT-528 CT-514 @mr reuses the idempotency key after a lost response and creates one entry', async ({
    page,
    runtime,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/working-time');
    await fillWorklogForm(page, {
      date: '2026-07-15',
      description: 'Retry E2E',
      duration: '1:00',
      taskId: 'CT-514',
    });
    const submitButton = page.getByRole('button', { name: 'Złóż raport', exact: true });
    const failedRequest = page.waitForEvent('requestfailed', {
      predicate: (request) => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/work-units'),
    });
    await submitButton.click();
    await failedRequest;
    await expect(
      page.getByText('Wystąpił błąd podczas łączenia z serwerem. Sprawdź swoje połączenie internetowe.'),
    ).toBeVisible();
    await expect(submitButton).toBeEnabled();

    const replayResponse = page.waitForResponse(
      (response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/work-units'),
    );
    await submitButton.click();
    expect((await replayResponse).status()).toBe(201);

    const creates = runtime.journal.entries.filter(({ method, path }) => method === 'POST' && path === WORK_UNITS_PATH);
    expect(creates).toHaveLength(2);
    expect(creates[0].requestHeaders['idempotency-key']).toBe(creates[1].requestHeaders['idempotency-key']);
    expect(runtime.state.workUnits.filter(({ description }) => description === 'Retry E2E')).toHaveLength(1);
  });
});

test('CT-513 @mr shows a keyboard accessible Task ID badge and complete tooltip', async ({ page, runtime }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const taskUnit = runtime.state.workUnits.find(({ description }) => description === 'Task ID worklog');
  const adjacentUnit = runtime.state.workUnits.find(({ description }) => description === 'Legacy past note');
  if (!taskUnit || !adjacentUnit) throw new Error('Expected adjacent calendar fixtures');
  taskUnit.taskId = 'CT-513, CT-426-LONG-TASK-IDENTIFIER';
  adjacentUnit.entryType = 'Worklog';
  adjacentUnit.duration = 'PT8H';
  adjacentUnit.description = 'Adjacent covering worklog';
  await page.goto('/working-time');
  const badge = page.getByLabel('Dodano 2 ID zadań', { exact: true });
  await badge.focus();
  await expect(page.getByRole('tooltip')).toContainText('CT-513, CT-426');
  await badge.hover();
  const adjacentTile = page.getByRole('article', { name: 'Adjacent covering worklog', exact: true });
  const readOverlap = async (): Promise<{ width: number; height: number; paintedAbove: boolean }> => {
    const adjacent = await adjacentTile.boundingBox();
    if (!adjacent) throw new Error('Expected adjacent worklog bounds');
    return page.getByRole('tooltip').evaluate((tooltip, neighbor) => {
      const bounds = tooltip.getBoundingClientRect();
      const left = Math.max(bounds.left, neighbor.x);
      const right = Math.min(bounds.right, neighbor.x + neighbor.width);
      const top = Math.max(bounds.top, neighbor.y);
      const bottom = Math.min(bounds.bottom, neighbor.y + neighbor.height);
      const pointerEvents = tooltip.style.pointerEvents;
      tooltip.style.pointerEvents = 'auto';
      const paintedAbove = tooltip.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2));
      tooltip.style.pointerEvents = pointerEvents;
      return { width: right - left, height: bottom - top, paintedAbove };
    }, adjacent);
  };
  const overlap = await readOverlap();
  expect(overlap.width).toBeGreaterThan(0);
  expect(overlap.height).toBeGreaterThan(0);
  expect(overlap.paintedAbove).toBe(true);
  await adjacentTile.hover();
  await badge.focus();
  const focusedOverlap = await readOverlap();
  expect(focusedOverlap.width).toBeGreaterThan(0);
  expect(focusedOverlap.height).toBeGreaterThan(0);
  expect(focusedOverlap.paintedAbove).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toBeHidden();
  await expect(badge).toBeFocused();
});

test.describe('working time to report navigation', () => {
  test('CT-515 @mr never displays 07:60 in calendar or report', async ({ page }) => {
    await page.goto('/working-time');
    // Wait for the (lazy-loaded) page to actually render before asserting absence, otherwise this
    // passes trivially on a still-blank page -- and navigating away before the chunk import
    // settles is exactly what used to race WebKit into a spurious pageerror.
    await expect(page.getByRole('heading', { name: 'Czas pracy', exact: true })).toBeVisible();
    await expect(page.getByText('07:60', { exact: true })).toHaveCount(0);
    await page.goto('/report?startDate=2026-07-01&endDate=2026-07-31');
    await expect(page.getByText('07:60', { exact: true })).toHaveCount(0);
    await expect(page.getByText('08:00', { exact: true })).toBeVisible();
  });
});
