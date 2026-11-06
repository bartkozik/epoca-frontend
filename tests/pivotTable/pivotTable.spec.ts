import type { Locator, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expect, test } from '../workUnitOverrides/fixtures/workUnitOverridesApi';
import { parseCsvTable } from './fixtures/parseCsvTable';
import { parsePivotExportWorkbook } from './fixtures/pivotExportWorkbook';

const defaultPivotUrl = '/pivot-table?startDate=2026-08-01&endDate=2026-08-31';
const usersByMonthShape = 'rows=UserKey&columns=MonthYearKey&values=DurationSum';
const pivotUrl = `${defaultPivotUrl}&${usersByMonthShape}`;
const completeMonthAxisUrl = `/pivot-table?startDate=2026-02-01&endDate=2026-08-20&${usersByMonthShape}`;
const pivotPath = '/organizations/overrides-e2e/pivot-tables/work-units/query';
const pivotExportPath = '/organizations/overrides-e2e/pivot-tables/work-units/export';
const pivotExportUrl = `${completeMonthAxisUrl}&clients=source-client&projects=source-project,pm-project&users=fixture-actor,fixture-author`;

type PivotRequest = {
  rows: string[];
  columns: string[];
  values: string[];
  filters: Array<{ key: string; includedValues: unknown[] | null }>;
  options: { rowSubtotals: boolean; columnSubtotals: boolean; grandTotals: boolean };
};

type RecordedRequest = { body: unknown; method: string; pathname: string };

type PivotExportBody = {
  presentation: {
    memberLabels: Array<{ key: string; label: string; value: unknown }>;
  };
  projection: { effectiveDateTo: string };
  query: PivotRequest;
};

const validKeys = new Set([
  'UserKey',
  'ProjectKey',
  'ClientKey',
  'YearKey',
  'MonthYearKey',
  'DateKey',
  'EntryTypeKey',
  'TaskKey',
]);
const validValues = new Set(['DurationSum', 'DurationAvg', 'EntriesCount']);

function pivotRequests(requests: RecordedRequest[]): PivotRequest[] {
  return requests
    .filter(({ method, pathname }) => method === 'POST' && pathname === pivotPath)
    .map(({ body }) => body as PivotRequest);
}

function expectValidPivotRequest(request: PivotRequest): void {
  expect(Object.keys(request).sort()).toEqual(['columns', 'filters', 'options', 'rows', 'values']);
  expect(request.values.length).toBeGreaterThan(0);
  expect(request.rows.every((key) => validKeys.has(key))).toBe(true);
  expect(request.columns.every((key) => validKeys.has(key))).toBe(true);
  expect(request.values.every((value) => validValues.has(value))).toBe(true);
  const dimensions = [...request.rows, ...request.columns, ...request.filters.map(({ key }) => key)];
  expect(new Set(dimensions).size).toBe(dimensions.length);
  expect(new Set(request.values).size).toBe(request.values.length);
  request.filters.forEach(({ includedValues, key }) => {
    expect(validKeys.has(key)).toBe(true);
    expect(includedValues === null || includedValues.length > 0).toBe(true);
  });
  expect(Object.keys(request.options).sort()).toEqual(['columnSubtotals', 'grandTotals', 'rowSubtotals']);
}

async function openPivot(page: Page, url = pivotUrl): Promise<void> {
  await page.goto(url);
  await expect(page.getByRole('table', { name: 'Pivot table' })).toBeVisible();
  await page.waitForLoadState('networkidle');
}

function shapeParams(page: Page): Record<string, string[]> {
  const params = new URL(page.url()).searchParams;
  return { rows: params.getAll('rows'), columns: params.getAll('columns'), values: params.getAll('values') };
}

function pivotConfigurationDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Pivot table fields' });
}

async function expandPivotConfiguration(page: Page): Promise<void> {
  const dialog = pivotConfigurationDialog(page);
  if (await dialog.isVisible()) return;
  await page.getByRole('button', { name: 'Configure fields' }).click();
  await expect(dialog).toBeVisible();
}

async function collapsePivotConfiguration(page: Page): Promise<void> {
  const dialog = pivotConfigurationDialog(page);
  if (!(await dialog.isVisible())) return;
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
}

function exportedBody(body: unknown): PivotExportBody {
  expect(body).toEqual({ presentation: expect.any(Object), projection: expect.any(Object), query: expect.any(Object) });
  return body as PivotExportBody;
}

async function downloadedBytes(downloadPath: string | null): Promise<Buffer> {
  expect(downloadPath).not.toBeNull();
  if (!downloadPath) throw new Error('Expected a completed browser download');
  return readFile(downloadPath);
}

async function boundingBox(locator: Locator): Promise<NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>> {
  const result = await locator.boundingBox();
  expect(result).not.toBeNull();
  if (!result) throw new Error('Expected locator to have a bounding box');
  return result;
}

async function moveByMenu(page: Page, field: string, destination: string): Promise<void> {
  await page.getByRole('button', { exact: true, name: `Move ${field}` }).click();
  await page
    .getByRole('menu', { name: `Move ${field}` })
    .getByRole('menuitem', { name: destination, exact: true })
    .click();
}

async function mouseDrag(
  source: Locator,
  target: Locator,
  expectedRegion: Locator,
  targetPosition: { xRatio: number; yRatio: number } = { xRatio: 0.5, yRatio: 0.5 }
): Promise<void> {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const [sourceBox, targetBox] = await Promise.all([boundingBox(source), boundingBox(target)]);
  const from = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 };
  const to = {
    x: targetBox.x + targetBox.width * targetPosition.xRatio,
    y: targetBox.y + targetBox.height * targetPosition.yRatio,
  };
  expect(Math.hypot(from.x - to.x, from.y - to.y)).toBeGreaterThan(5);

  await source.page().mouse.move(from.x, from.y);
  await source.page().mouse.down();
  await source.page().mouse.move(to.x, to.y, { steps: 12 });
  await expect(expectedRegion.getByTestId('pivot-insertion')).toBeVisible();
  await source.page().mouse.up();
}

async function expectLatestRows(requests: RecordedRequest[], rows: string[]): Promise<void> {
  await expect.poll(() => pivotRequests(requests).at(-1)?.rows).toEqual(rows);
}

async function reportScrollSnapshot(matrix: Locator): Promise<{
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
  top: number;
}> {
  return matrix.evaluate((element) => {
    let scrollOwner = element.parentElement;
    while (scrollOwner && !/(auto|scroll)/.test(getComputedStyle(scrollOwner).overflowY)) {
      scrollOwner = scrollOwner.parentElement;
    }
    if (!scrollOwner) throw new Error('Expected a vertical report scroll owner');
    const rect = scrollOwner.getBoundingClientRect();
    return {
      clientHeight: scrollOwner.clientHeight,
      scrollHeight: scrollOwner.scrollHeight,
      scrollTop: scrollOwner.scrollTop,
      top: rect.top,
    };
  });
}

async function scrollReportPastMatrixHeader(matrix: Locator, pixels = 20): Promise<void> {
  await matrix.evaluate((element, distance) => {
    let scrollOwner = element.parentElement;
    while (scrollOwner && !/(auto|scroll)/.test(getComputedStyle(scrollOwner).overflowY)) {
      scrollOwner = scrollOwner.parentElement;
    }
    const header = element.querySelector(':scope > table > thead');
    if (!scrollOwner || !header) throw new Error('Expected the report scroll owner and matrix header');
    scrollOwner.scrollTop += header.getBoundingClientRect().top - scrollOwner.getBoundingClientRect().top + distance;
    scrollOwner.dispatchEvent(new Event('scroll'));
  }, pixels);
}

async function scrollReportToGrandTotalHandoff(matrix: Locator): Promise<void> {
  await matrix.evaluate((element) => {
    let scrollOwner = element.parentElement;
    while (scrollOwner && !/(auto|scroll)/.test(getComputedStyle(scrollOwner).overflowY)) {
      scrollOwner = scrollOwner.parentElement;
    }
    const shell = element.parentElement;
    const naturalGrandTotal = element.querySelector(':scope > table > tbody > tr:last-child');
    if (!scrollOwner || !shell || !naturalGrandTotal) {
      throw new Error('Expected the report scroll owner and natural grand total');
    }
    const bottomInset = Number.parseFloat(getComputedStyle(shell).getPropertyValue('--pivot-sticky-bottom-inset'));
    const grandTotalClearance = Number.parseFloat(
      getComputedStyle(shell).getPropertyValue('--pivot-grand-total-clearance')
    );
    const effectiveBottom =
      scrollOwner.getBoundingClientRect().bottom - (Number.isFinite(bottomInset) ? bottomInset : 0);
    const naturalGrandTotalRect = naturalGrandTotal.getBoundingClientRect();
    const dockTop =
      effectiveBottom - naturalGrandTotalRect.height - (Number.isFinite(grandTotalClearance) ? grandTotalClearance : 0);
    scrollOwner.scrollTop += naturalGrandTotalRect.top - dockTop;
    scrollOwner.dispatchEvent(new Event('scroll'));
  });
}

test('configuration modal opens over the same-size matrix, returns focus on close, and stacks the assignment areas at every width', async ({
  page,
  overrideApi,
}) => {
  await page.setViewportSize({ height: 1000, width: 1280 });
  await openPivot(page);

  const matrix = page.getByRole('region', { name: 'Scrollable pivot table' });
  const trigger = page.getByRole('button', { name: 'Configure fields' });
  const dialog = pivotConfigurationDialog(page);
  const requestCount = pivotRequests(overrideApi.requests).length;

  await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  await expect(trigger).not.toHaveAttribute('aria-expanded');
  await expect(dialog).toHaveCount(0);
  const collapsedMatrix = await boundingBox(matrix);

  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Pivot table fields' })).toBeVisible();
  const expandedMatrix = await boundingBox(matrix);
  expect(Math.abs(collapsedMatrix.width - expandedMatrix.width)).toBeLessThan(2);
  expect(Math.abs(collapsedMatrix.y - expandedMatrix.y)).toBeLessThan(2);

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(pivotRequests(overrideApi.requests)).toHaveLength(requestCount);

  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(pivotRequests(overrideApi.requests)).toHaveLength(requestCount);

  await trigger.click();
  await expect(dialog).toBeVisible();
  const reopenedMatrix = await boundingBox(matrix);
  expect(Math.abs(reopenedMatrix.width - expandedMatrix.width)).toBeLessThan(2);
  expect(Math.abs(reopenedMatrix.y - expandedMatrix.y)).toBeLessThan(2);
  expect(pivotRequests(overrideApi.requests)).toHaveLength(requestCount);

  const available = dialog.getByRole('region', { name: 'Available fields' });
  const layoutHeading = dialog.getByRole('heading', { name: 'Table layout', level: 3 });
  const assignmentGrid = dialog.getByTestId('pivot-assignment-grid');
  const areas = ['Filters', 'Rows', 'Columns', 'Values'];
  await expect(available.getByRole('heading', { name: 'Available fields', level: 3 })).toBeVisible();
  for (const area of areas) {
    await expect(
      dialog.getByRole('region', { name: area }).getByRole('heading', { name: area, level: 4 })
    ).toBeVisible();
  }
  await expect(
    dialog.getByRole('region', { name: 'Filters' }).getByText('Drag a field here', { exact: true })
  ).toBeVisible();
  const widths = [1200, 1199, 768, 767];
  const rowByArea = [0, 1, 2, 3];
  for (const width of widths) {
    await page.setViewportSize({ height: 1200, width });
    const [availableBox, headingBox, gridBox, ...areaBoxes] = await Promise.all([
      boundingBox(available),
      boundingBox(layoutHeading),
      boundingBox(assignmentGrid),
      ...areas.map((area) => boundingBox(dialog.getByRole('region', { name: area }))),
    ]);
    expect(availableBox.y + availableBox.height).toBeLessThan(gridBox.y);
    expect(availableBox.y + availableBox.height).toBeLessThanOrEqual(headingBox.y);
    expect(headingBox.y + headingBox.height).toBeLessThanOrEqual(gridBox.y);
    expect(Math.abs(availableBox.x - gridBox.x)).toBeLessThan(2);
    expect(Math.abs(availableBox.width - gridBox.width)).toBeLessThan(2);

    const rowTops = Array.from(new Set(rowByArea)).map((rowIndex) => areaBoxes[rowByArea.indexOf(rowIndex)].y);
    expect(areaBoxes.map((area, index) => Math.abs(area.y - rowTops[rowByArea[index]]) < 2)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(rowTops.slice(1).map((top, index) => top > rowTops[index])).toEqual(
      Array.from({ length: rowTops.length - 1 }, () => true)
    );
  }
});

test('starts with the useful collapsed default and restores the accepted local preset after reload', async ({
  page,
  overrideApi,
}) => {
  await page.setViewportSize({ height: 900, width: 1512 });
  await openPivot(page, defaultPivotUrl);

  expect(pivotRequests(overrideApi.requests).at(-1)).toMatchObject({
    rows: ['MonthYearKey', 'UserKey'],
    columns: [],
    values: ['DurationSum'],
    options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
  });
  await expect(pivotConfigurationDialog(page)).toHaveCount(0);
  await expect.poll(() => shapeParams(page)).toEqual({ rows: ['MonthYearKey', 'UserKey'], columns: [], values: ['DurationSum'] });
  await expect(page.getByRole('combobox', { name: 'Table layout' }).locator('option:checked')).toHaveText(
    'Months → people'
  );

  await expandPivotConfiguration(page);
  await moveByMenu(page, 'Project', 'Rows');
  await expectLatestRows(overrideApi.requests, ['MonthYearKey', 'UserKey', 'ProjectKey']);
  await page.reload();
  await expect(page.getByRole('table', { name: 'Pivot table' })).toBeVisible();
  await expectLatestRows(overrideApi.requests, ['MonthYearKey', 'UserKey', 'ProjectKey']);
  await expect(pivotConfigurationDialog(page)).toHaveCount(0);

  await openPivot(page, defaultPivotUrl);
  await expectLatestRows(overrideApi.requests, ['MonthYearKey', 'UserKey', 'ProjectKey']);
  await expect
    .poll(() => shapeParams(page))
    .toEqual({ rows: ['MonthYearKey', 'UserKey', 'ProjectKey'], columns: [], values: ['DurationSum'] });
});

test('a layout URL builds the table, a manual move rewrites it and Back returns from a picked layout', async ({
  page,
  overrideApi,
}) => {
  await page.setViewportSize({ height: 1200, width: 1280 });
  await openPivot(page, `${defaultPivotUrl}&rows=ProjectKey&rows=UserKey&values=DurationSum`);

  const tableLayout = page.getByRole('combobox', { name: 'Table layout' });
  await expect(tableLayout.locator('option:checked')).toHaveText('Projects → people');
  await expect
    .poll(() => pivotRequests(overrideApi.requests).at(-1))
    .toMatchObject({ rows: ['ProjectKey', 'UserKey'], columns: [], values: ['DurationSum'] });

  await expandPivotConfiguration(page);
  await expect(page.getByRole('region', { name: 'Rows' }).getByRole('button', { name: /^Drag / })).toHaveText([
    'Project',
    'User',
  ]);
  await moveByMenu(page, 'Client', 'Columns');
  await expect.poll(() => pivotRequests(overrideApi.requests).at(-1)?.columns).toEqual(['ClientKey']);
  await collapsePivotConfiguration(page);

  await expect
    .poll(() => shapeParams(page))
    .toEqual({ rows: ['ProjectKey', 'UserKey'], columns: ['ClientKey'], values: ['DurationSum'] });
  await expect(tableLayout).toHaveValue('custom');
  await expect(tableLayout.locator('option:checked')).toHaveText('Custom layout');

  await tableLayout.selectOption({ label: 'Months → people' });
  await expect
    .poll(() => pivotRequests(overrideApi.requests).at(-1))
    .toMatchObject({ rows: ['MonthYearKey', 'UserKey'], columns: [] });
  expect(shapeParams(page)).toEqual({ rows: ['MonthYearKey', 'UserKey'], columns: [], values: ['DurationSum'] });
  await page.goBack();
  await expect
    .poll(() => pivotRequests(overrideApi.requests).at(-1))
    .toMatchObject({ rows: ['ProjectKey', 'UserKey'], columns: ['ClientKey'] });
  await expect(tableLayout.locator('option:checked')).toHaveText('Custom layout');
});

test('bounded menu reorder and real whole-chip pointer drag produce the requested field order', async ({
  page,
  overrideApi,
}) => {
  await page.setViewportSize({ height: 1200, width: 1280 });
  await openPivot(page);
  await expandPivotConfiguration(page);
  const rows = page.getByRole('region', { name: 'Rows' });
  const columns = page.getByRole('region', { name: 'Columns' });
  const projectDragSurface = page.getByRole('button', { name: 'Drag Project' });
  const grip = projectDragSurface.getByTestId('pivot-drag-dots');
  await expect(grip).toBeVisible();
  await expect(grip).toHaveAttribute('fill', 'currentColor');
  const dragAffordance = await projectDragSurface.evaluate((button) => {
    const dots = button.querySelector('[data-testid="pivot-drag-dots"]');
    return {
      buttonHeight: button.getBoundingClientRect().height,
      buttonWidth: button.getBoundingClientRect().width,
      color: getComputedStyle(button).color,
      fill: dots ? getComputedStyle(dots).fill : null,
      gripWidth: dots?.getBoundingClientRect().width ?? 0,
    };
  });
  expect(dragAffordance.buttonHeight).toBe(40);
  expect(dragAffordance.buttonWidth).toBeGreaterThan(dragAffordance.gripWidth);
  expect(dragAffordance.fill).toBe(dragAffordance.color);

  await page.getByRole('button', { exact: true, name: 'Move User' }).click();
  let userMenu = page.getByRole('menu', { name: 'Move User' });
  await expect(userMenu.getByRole('menuitem', { name: 'Move earlier' })).toBeDisabled();
  await expect(userMenu.getByRole('menuitem', { name: 'Move later' })).toBeDisabled();
  await page.getByRole('button', { exact: true, name: 'Move User' }).click();

  await moveByMenu(page, 'Project', 'Rows');
  await expectLatestRows(overrideApi.requests, ['UserKey', 'ProjectKey']);

  await page.getByRole('button', { exact: true, name: 'Move User' }).click();
  userMenu = page.getByRole('menu', { name: 'Move User' });
  await expect(userMenu.getByRole('menuitem', { name: 'Move earlier' })).toBeDisabled();
  await expect(userMenu.getByRole('menuitem', { name: 'Move later' })).toBeEnabled();
  await page.getByRole('button', { exact: true, name: 'Move User' }).click();

  await page.getByRole('button', { exact: true, name: 'Move Project' }).click();
  const projectMenu = page.getByRole('menu', { name: 'Move Project' });
  await expect(projectMenu.getByRole('menuitem', { name: 'Move earlier' })).toBeEnabled();
  await expect(projectMenu.getByRole('menuitem', { name: 'Move later' })).toBeDisabled();
  await projectMenu.getByRole('menuitem', { name: 'Move earlier' }).click();
  await expectLatestRows(overrideApi.requests, ['ProjectKey', 'UserKey']);

  const beforePointerReorder = pivotRequests(overrideApi.requests).length;
  await mouseDrag(
    page.getByRole('button', { name: 'Drag Project' }),
    page.getByRole('button', { name: 'Drag User' }),
    rows,
    { xRatio: 0.5, yRatio: 0.85 }
  );
  await expectLatestRows(overrideApi.requests, ['UserKey', 'ProjectKey']);
  expect(pivotRequests(overrideApi.requests)).toHaveLength(beforePointerReorder + 1);

  const beforeCrossAreaMove = pivotRequests(overrideApi.requests).length;
  await mouseDrag(page.getByRole('button', { name: 'Drag Client' }), columns, columns, { xRatio: 0.3, yRatio: 0.5 });
  await expect.poll(() => pivotRequests(overrideApi.requests).at(-1)?.columns).toEqual(['MonthYearKey', 'ClientKey']);
  expect(pivotRequests(overrideApi.requests)).toHaveLength(beforeCrossAreaMove + 1);
  pivotRequests(overrideApi.requests).forEach(expectValidPivotRequest);
});

test('keyboard reorder completes and Escape cancels without changing the accepted layout', async ({ page, overrideApi }) => {
  await page.setViewportSize({ height: 1200, width: 1280 });
  await openPivot(page);
  await expandPivotConfiguration(page);
  await moveByMenu(page, 'Project', 'Rows');
  await expectLatestRows(overrideApi.requests, ['UserKey', 'ProjectKey']);

  const project = page.getByRole('button', { name: 'Drag Project' });
  const beforeKeyboardReorder = pivotRequests(overrideApi.requests).length;
  await project.focus();
  await project.press('Space');
  await expect(page.getByText('Picked up Project.')).toBeVisible();
  await project.press('ArrowLeft');
  await expect(page.getByText('Project over Rows, position 1.')).toBeVisible();
  await project.press('Space');
  await expectLatestRows(overrideApi.requests, ['ProjectKey', 'UserKey']);
  expect(pivotRequests(overrideApi.requests)).toHaveLength(beforeKeyboardReorder + 1);

  const client = page.getByRole('button', { name: 'Drag Client' });
  await client.focus();
  await client.press('Space');
  await expect(page.getByText('Picked up Client.')).toBeVisible();
  await client.press('Escape');
  await expect(page.getByText('Moving Client was cancelled.')).toBeVisible();
  expect(pivotRequests(overrideApi.requests)).toHaveLength(beforeKeyboardReorder + 1);
});

test('menus, filter Apply, independent totals, and multiple Values update full request bodies', async ({
  page,
  overrideApi,
}) => {
  await page.setViewportSize({ height: 1200, width: 1280 });
  await openPivot(page);
  await expandPivotConfiguration(page);

  await moveByMenu(page, 'Entry type', 'Filters');
  await page.getByRole('button', { name: 'Configure filter for Entry type' }).click();
  const filterDialog = page.getByRole('dialog', { name: 'Filter: Entry type' });
  await filterDialog.getByRole('checkbox', { name: 'Note' }).click();
  await filterDialog.getByRole('button', { name: 'Apply' }).click();
  await expect
    .poll(() => pivotRequests(overrideApi.requests).at(-1)?.filters)
    .toEqual([{ key: 'EntryTypeKey', includedValues: ['Worklog'] }]);

  await moveByMenu(page, 'Average duration', 'Values');
  await moveByMenu(page, 'Entry count', 'Values');
  await page.getByRole('switch', { name: 'Row subtotals' }).click();
  await page.getByRole('switch', { name: 'Column subtotals' }).click();
  await page.getByRole('switch', { name: 'Grand totals' }).click();

  const last = pivotRequests(overrideApi.requests).at(-1) as PivotRequest;
  expect(last.values).toEqual(['DurationSum', 'DurationAvg', 'EntriesCount']);
  expect(last.options).toEqual({ rowSubtotals: false, columnSubtotals: false, grandTotals: false });
  pivotRequests(overrideApi.requests).forEach(expectValidPivotRequest);
  await expect(page.getByRole('columnheader', { name: 'Entry count' }).first()).toBeVisible();
});

test('grouping and filtering by Task updates the request body and renders the raw task id', async ({ page, overrideApi }) => {
  await page.setViewportSize({ height: 1200, width: 1280 });
  await openPivot(page);
  await expandPivotConfiguration(page);

  await moveByMenu(page, 'Task', 'Rows');
  await expectLatestRows(overrideApi.requests, ['UserKey', 'TaskKey']);
  await collapsePivotConfiguration(page);

  const matrix = page.getByRole('region', { name: 'Scrollable pivot table' });
  await expect(matrix.getByRole('columnheader', { name: 'Task' })).toBeVisible();
  await expect(matrix.getByText('PROJ-1', { exact: true }).first()).toBeVisible();

  await expandPivotConfiguration(page);
  await moveByMenu(page, 'Task', 'Filters');
  await page.getByRole('button', { name: 'Configure filter for Task' }).click();
  const filterDialog = page.getByRole('dialog', { name: 'Filter: Task' });
  await filterDialog.getByRole('button', { name: 'Clear' }).click();
  await expect(filterDialog.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await filterDialog.getByRole('button', { name: 'Select all' }).click();
  await filterDialog.getByRole('button', { name: 'Apply' }).click();

  await expect
    .poll(() => pivotRequests(overrideApi.requests).at(-1)?.filters)
    .toEqual([{ key: 'TaskKey', includedValues: null }]);
  pivotRequests(overrideApi.requests).forEach(expectValidPivotRequest);
});

test('complete month axis renders sparse February-August data without dropping empty months', async ({
  page,
  overrideApi,
}) => {
  await page.setViewportSize({ height: 768, width: 1024 });
  await openPivot(page, completeMonthAxisUrl);
  expect(pivotRequests(overrideApi.requests).length).toBeGreaterThan(0);

  const matrix = page.getByRole('region', { name: 'Scrollable pivot table' });
  const monthHeaders = ['February', 'March', 'April', 'May', 'June', 'July', 'August'].map((month) => `${month} 2026`);
  await expect(matrix.locator('thead tr').first().getByRole('columnheader')).toHaveText([
    'User',
    ...monthHeaders,
    'Grand total',
  ]);

  const firstLeafValues = matrix.locator('tbody tr').first().locator('td');
  await expect(firstLeafValues).toHaveText(['', '', '', '02:00', '02:00', '02:00', '02:00', '02:00']);

  const overflow = await matrix.evaluate((element) => {
    const table = element.querySelector(':scope > table');
    return {
      horizontal: element.scrollWidth > element.clientWidth,
      maxHeight: getComputedStyle(element).maxHeight,
      overflowY: getComputedStyle(element).overflowY,
      scrollTop: element.scrollTop,
      verticalContentOverflow: table ? Math.max(0, table.getBoundingClientRect().height - element.clientHeight) : null,
    };
  });
  expect(overflow).toEqual({
    horizontal: true,
    maxHeight: 'none',
    overflowY: 'hidden',
    scrollTop: 0,
    verticalContentOverflow: 0,
  });
});

test('a hovered or focused sticky row label tooltip stays above the following row', async ({ page, overrideApi }) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await openPivot(page);
  expect(pivotRequests(overrideApi.requests).length).toBeGreaterThan(0);
  await expandPivotConfiguration(page);
  await moveByMenu(page, 'Average duration', 'Values');
  await moveByMenu(page, 'Entry count', 'Values');
  await moveByMenu(page, 'Client', 'Columns');
  await collapsePivotConfiguration(page);

  const matrix = page.getByRole('region', { name: 'Scrollable pivot table' });
  await expect(matrix).toHaveAttribute('data-row-fields-sticky', 'true');

  const bodyRows = matrix.locator(':scope > table > tbody > tr');
  const tooltipRowHeader = bodyRows.nth(1).getByRole('rowheader');
  const followingRowHeader = bodyRows.nth(2).getByRole('rowheader');
  const truncatedLabel = tooltipRowHeader.locator('[aria-describedby]');
  await expect(truncatedLabel).toBeVisible();

  await truncatedLabel.hover();
  const tooltip = tooltipRowHeader.getByRole('tooltip');
  await expect(tooltip).toHaveAttribute('aria-hidden', 'false');

  const [tooltipBox, followingRowHeaderBox] = await Promise.all([
    boundingBox(tooltip),
    boundingBox(followingRowHeader),
  ]);
  expect(tooltipBox.y).toBeLessThan(followingRowHeaderBox.y + followingRowHeaderBox.height);
  expect(tooltipBox.y + tooltipBox.height).toBeGreaterThan(followingRowHeaderBox.y);

  const [tooltipRowZIndex, followingRowZIndex] = await Promise.all([
    tooltipRowHeader.evaluate((element) => Number(getComputedStyle(element).zIndex)),
    followingRowHeader.evaluate((element) => Number(getComputedStyle(element).zIndex)),
  ]);
  expect(tooltipRowZIndex).toBeGreaterThan(followingRowZIndex);

  await page.mouse.move(0, 0);
  await truncatedLabel.focus();
  await expect(tooltip).toHaveAttribute('aria-hidden', 'false');
  const focusedRowZIndex = await tooltipRowHeader.evaluate((element) => Number(getComputedStyle(element).zIndex));
  expect(focusedRowZIndex).toBeGreaterThan(followingRowZIndex);
});

test('wide matrix has no pivot-owned vertical rail and reserves no horizontal rail without overflow', async ({
  page,
  overrideApi,
}) => {
  await page.setViewportSize({ height: 1000, width: 2280 });
  await openPivot(page);
  expect(pivotRequests(overrideApi.requests).length).toBeGreaterThan(0);

  const matrix = page.getByRole('region', { name: 'Scrollable pivot table' });
  const geometry = await matrix.evaluate((element: HTMLElement) => {
    const table = element.querySelector(':scope > table');
    const shell = element.parentElement;
    if (!table || !shell) throw new Error('Expected the pivot table and its outer shell');
    const matrixRect = element.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    return {
      horizontalOverflow: element.scrollWidth > element.clientWidth,
      horizontalRailHeight: element.offsetHeight - element.clientHeight,
      overflowX: getComputedStyle(element).overflowX,
      overflowY: getComputedStyle(element).overflowY,
      shellClearance: shellRect.bottom - matrixRect.bottom,
      tableBottomGap: matrixRect.bottom - tableRect.bottom,
      verticalOverflow: element.scrollHeight > element.clientHeight,
      verticalScrollbarWidth: element.offsetWidth - element.clientWidth,
    };
  });

  expect(geometry).toEqual({
    horizontalOverflow: false,
    horizontalRailHeight: 0,
    overflowX: 'auto',
    overflowY: 'hidden',
    shellClearance: 24,
    tableBottomGap: 0,
    verticalOverflow: false,
    verticalScrollbarWidth: 0,
  });
});

test('matrix delegates vertical scrolling while its header and grand total dock within table boundaries', async ({
  page,
  overrideApi,
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await openPivot(page, completeMonthAxisUrl);
  await expandPivotConfiguration(page);
  expect(pivotRequests(overrideApi.requests).length).toBeGreaterThan(0);
  await moveByMenu(page, 'Project', 'Rows');
  await moveByMenu(page, 'Average duration', 'Values');
  await moveByMenu(page, 'Entry count', 'Values');
  await collapsePivotConfiguration(page);

  const matrix = page.getByRole('region', { name: 'Scrollable pivot table' });
  const headerDock = page.getByTestId('pivot-header-dock');
  const grandTotalDock = page.getByTestId('pivot-grand-total-dock');
  await expect(grandTotalDock).toHaveAttribute('data-docked', 'true');
  const geometry = await matrix.evaluate((element: HTMLElement) => {
    const rect = (target: Element): DOMRect => target.getBoundingClientRect();
    const table = element.querySelector(':scope > table');
    if (!table) throw new Error('Expected the semantic matrix table');
    let scrollOwner = element.parentElement;
    while (scrollOwner && !/(auto|scroll)/.test(getComputedStyle(scrollOwner).overflowY)) {
      scrollOwner = scrollOwner.parentElement;
    }
    if (!scrollOwner) throw new Error('Expected the report scroll owner');
    const headerRows = Array.from(table.querySelectorAll('thead tr'));
    const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
    const columns = Array.from(table.querySelectorAll('col'));
    const valueHeader = table.querySelector<HTMLTableCellElement>('th[id^="pivot-value-"]');
    const matchingValueCell = valueHeader
      ? table.querySelector<HTMLTableCellElement>(`td[headers~="${valueHeader.id}"]`)
      : null;
    const rowHeader = table.querySelector<HTMLTableCellElement>('tbody th');
    const valueCell = table.querySelector<HTMLTableCellElement>('tbody td');
    const shell = element.parentElement;
    const grandTotalDock = shell?.querySelector<HTMLElement>('[data-testid="pivot-grand-total-dock"]');
    const grandTotalSurface = grandTotalDock?.querySelector<HTMLElement>('[data-testid="pivot-grand-total-surface"]');
    const grandTotalClearance = grandTotalDock?.querySelector<HTMLElement>(
      '[data-testid="pivot-grand-total-clearance"]'
    );
    const grandTotalCell = grandTotalDock?.querySelector<HTMLTableCellElement>('tbody tr > *');
    return {
      bodyHeights: bodyRows.map((row) => rect(row).height),
      columnWidths: columns.map((column) => rect(column).width),
      headerHeights: headerRows.map((row) => rect(row).height),
      headerTops: headerRows.map((row) => rect(row).top),
      horizontalOverflow: element.scrollWidth > element.clientWidth,
      matchingBoundaries:
        valueHeader && matchingValueCell
          ? {
              headerLeft: rect(valueHeader).left,
              headerRight: rect(valueHeader).right,
              valueLeft: rect(matchingValueCell).left,
              valueRight: rect(matchingValueCell).right,
            }
          : null,
      matrixShellBottomGap: shell ? rect(shell).bottom - rect(element).bottom : null,
      nativeScrollbarGap: rect(element).bottom - rect(table).bottom,
      verticalScrollbarWidth: element.offsetWidth - element.clientWidth,
      grandTotalBottom: grandTotalDock ? rect(grandTotalDock).bottom : null,
      grandTotalClearanceHeight: grandTotalClearance ? rect(grandTotalClearance).height : null,
      grandTotalHeight: grandTotalDock ? rect(grandTotalDock).height : null,
      grandTotalSurfaceBottom: grandTotalSurface ? rect(grandTotalSurface).bottom : null,
      grandTotalSurfaceHeight: grandTotalSurface ? rect(grandTotalSurface).height : null,
      grandTotalBackground: grandTotalCell ? getComputedStyle(grandTotalCell).backgroundColor : null,
      grandTotalPosition: grandTotalDock ? getComputedStyle(grandTotalDock).position : null,
      rowTextAlign: rowHeader ? getComputedStyle(rowHeader).textAlign : null,
      reportClientHeight: scrollOwner.clientHeight,
      reportScrollHeight: scrollOwner.scrollHeight,
      reportViewportBottom: rect(scrollOwner).bottom,
      scrollbarWidth: getComputedStyle(element).scrollbarWidth,
      valueTextAlign: valueCell ? getComputedStyle(valueCell).textAlign : null,
      verticalContentOverflow: Math.max(0, rect(table).height - element.clientHeight),
      verticalOverflowStyle: getComputedStyle(element).overflowY,
    };
  });

  expect(geometry.horizontalOverflow).toBe(true);
  expect(geometry.verticalContentOverflow).toBe(0);
  expect(geometry.verticalOverflowStyle).toBe('hidden');
  expect(geometry.reportScrollHeight).toBeGreaterThan(geometry.reportClientHeight);
  geometry.headerHeights.forEach((height) => expect(Math.abs(height - 40)).toBeLessThanOrEqual(1));
  geometry.bodyHeights.forEach((height) => expect(Math.abs(height - 44)).toBeLessThanOrEqual(1));
  geometry.headerTops
    .slice(1)
    .forEach((top, index) => expect(Math.abs(top - geometry.headerTops[index] - 40)).toBeLessThanOrEqual(1));
  expect(geometry.columnWidths.slice(0, 2)).toEqual([176, 176]);
  geometry.columnWidths.slice(2).forEach((width) => expect(Math.abs(width - 112)).toBeLessThan(1));
  expect(geometry.matchingBoundaries).not.toBeNull();
  const matchingBoundaries = geometry.matchingBoundaries ?? {
    headerLeft: Number.NaN,
    headerRight: Number.NaN,
    valueLeft: Number.NaN,
    valueRight: Number.NaN,
  };
  expect(Math.abs(matchingBoundaries.headerLeft - matchingBoundaries.valueLeft)).toBeLessThan(1);
  expect(Math.abs(matchingBoundaries.headerRight - matchingBoundaries.valueRight)).toBeLessThan(1);
  expect(geometry.rowTextAlign).toBe('left');
  expect(geometry.valueTextAlign).toBe('right');
  expect(['auto', 'thin']).toContain(geometry.scrollbarWidth);
  expect(geometry.grandTotalPosition).toBe('fixed');
  expect(Math.abs((geometry.grandTotalHeight ?? Number.NaN) - 68)).toBeLessThanOrEqual(1);
  expect(Math.abs((geometry.grandTotalSurfaceHeight ?? Number.NaN) - 44)).toBeLessThanOrEqual(1);
  expect(Math.abs((geometry.grandTotalClearanceHeight ?? Number.NaN) - 24)).toBeLessThanOrEqual(1);
  expect(geometry.grandTotalBackground).toMatch(/^rgb/);
  expect(geometry.grandTotalBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(Math.abs(geometry.reportViewportBottom - (geometry.grandTotalBottom ?? Number.NaN))).toBeLessThan(2);
  expect(Math.abs(geometry.reportViewportBottom - (geometry.grandTotalSurfaceBottom ?? Number.NaN) - 24)).toBeLessThan(
    2
  );
  expect(Math.abs((geometry.matrixShellBottomGap ?? Number.NaN) - 24)).toBeLessThan(2);
  expect(geometry.nativeScrollbarGap).toBeGreaterThanOrEqual(0);
  expect(geometry.nativeScrollbarGap).toBeLessThanOrEqual(12);
  expect(geometry.verticalScrollbarWidth).toBe(0);

  await matrix.evaluate((element) => {
    element.scrollLeft = 180;
    element.dispatchEvent(new Event('scroll'));
  });
  await expect
    .poll(() => matrix.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop })))
    .toEqual({ left: 180, top: 0 });
  await expect
    .poll(() => headerDock.locator('table').evaluate((element) => element.style.transform))
    .toBe('translateX(-180px)');

  await scrollReportPastMatrixHeader(matrix);
  await expect(headerDock).toHaveAttribute('data-mode', 'sticky');
  await expect(headerDock).toBeVisible();
  const [reportScroll, headerDockBox] = await Promise.all([reportScrollSnapshot(matrix), boundingBox(headerDock)]);
  expect(reportScroll.scrollTop).toBeGreaterThan(0);
  expect(Math.abs(headerDockBox.y - reportScroll.top)).toBeLessThan(2);
  await expect(grandTotalDock).toHaveAttribute('data-docked', 'true');

  const lastHeader = headerDock.locator('thead tr').last().locator('th').first();
  const [headerBox, firstBodyRowBox, headerVisuals] = await Promise.all([
    boundingBox(lastHeader),
    boundingBox(matrix.locator(':scope > table > tbody > tr').first()),
    lastHeader.evaluate((header) => {
      const dock = header.closest<HTMLElement>('[data-testid="pivot-header-dock"]');
      return {
        backgroundColor: getComputedStyle(header).backgroundColor,
        dockOpacity: dock ? getComputedStyle(dock).opacity : '',
        dockPointerEvents: dock ? getComputedStyle(dock).pointerEvents : '',
        dockZIndex: dock ? getComputedStyle(dock).zIndex : '',
      };
    }),
  ]);
  expect(headerVisuals).toEqual({
    backgroundColor: expect.stringMatching(/^rgb/),
    dockOpacity: '1',
    dockPointerEvents: 'none',
    dockZIndex: '7',
  });
  expect(headerVisuals.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(headerBox.y + headerBox.height).toBeGreaterThan(firstBodyRowBox.y);

  await scrollReportToGrandTotalHandoff(matrix);
  await expect(grandTotalDock).toHaveAttribute('data-docked', 'false');
  const handoff = await matrix.evaluate((element) => {
    let scrollOwner = element.parentElement;
    while (scrollOwner && !/(auto|scroll)/.test(getComputedStyle(scrollOwner).overflowY)) {
      scrollOwner = scrollOwner.parentElement;
    }
    const naturalGrandTotal = element.querySelector(':scope > table > tbody > tr:last-child');
    if (!scrollOwner || !naturalGrandTotal) throw new Error('Expected grand-total handoff geometry');
    return {
      naturalBottom: naturalGrandTotal.getBoundingClientRect().bottom,
      viewportBottom: scrollOwner.getBoundingClientRect().bottom,
    };
  });
  expect(Math.abs(handoff.viewportBottom - handoff.naturalBottom - 24)).toBeLessThan(2);
});

test('row-field freezing adapts to width while the full column header stays vertically sticky', async ({
  page,
  overrideApi,
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await openPivot(page);
  await expandPivotConfiguration(page);
  expect(pivotRequests(overrideApi.requests).length).toBeGreaterThan(0);
  const matrix = page.getByRole('region', { name: 'Scrollable pivot table' });

  await moveByMenu(page, 'Project', 'Rows');
  await expect(matrix).toHaveAttribute('data-row-fields-sticky', 'true');

  for (const field of ['Client', 'Year', 'Month', 'Date', 'Entry type']) {
    await moveByMenu(page, field, 'Rows');
  }
  await expect(matrix).toHaveAttribute('data-row-fields-sticky', 'false');
  const beforeHorizontalScroll = await matrix.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    valueLeft: element.querySelector('tbody td')?.getBoundingClientRect().left ?? 0,
  }));
  expect(beforeHorizontalScroll.scrollWidth).toBeGreaterThan(beforeHorizontalScroll.clientWidth);
  await matrix.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect.poll(() => matrix.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  const valueAfterHorizontalScroll = await matrix.evaluate((element) => {
    const matrixBox = element.getBoundingClientRect();
    const valueBox = element.querySelector('tbody td')?.getBoundingClientRect();
    return valueBox
      ? {
          matrixLeft: matrixBox.left,
          matrixRight: matrixBox.right,
          valueLeft: valueBox.left,
          valueRight: valueBox.right,
        }
      : null;
  });
  expect(valueAfterHorizontalScroll).not.toBeNull();
  const visibleValue = valueAfterHorizontalScroll ?? {
    matrixLeft: Number.NaN,
    matrixRight: Number.NaN,
    valueLeft: Number.NaN,
    valueRight: Number.NaN,
  };
  expect(visibleValue.valueRight).toBeGreaterThan(visibleValue.matrixLeft);
  expect(visibleValue.valueLeft).toBeLessThan(visibleValue.matrixRight);
  expect(visibleValue.valueLeft).toBeLessThan(beforeHorizontalScroll.valueLeft);

  await page.setViewportSize({ height: 844, width: 767 });
  await expect(matrix).toHaveAttribute('data-row-fields-sticky', 'false');
  const columnHeader = matrix.locator('thead th').last();
  const bodyRowHeader = matrix.locator('tbody th').first();
  await expect(columnHeader).toHaveCSS('position', 'sticky');
  await expect(bodyRowHeader).toHaveCSS('position', 'static');
  expect(await matrix.evaluate((element) => element.scrollTop)).toBe(0);
  await scrollReportPastMatrixHeader(matrix);
  const headerDock = page.getByTestId('pivot-header-dock');
  await expect(headerDock).toHaveAttribute('data-mode', 'sticky');
  await expect(headerDock).toHaveCSS('position', 'fixed');
  const [reportScroll, dockBox] = await Promise.all([reportScrollSnapshot(matrix), boundingBox(headerDock)]);
  expect(reportScroll.scrollTop).toBeGreaterThan(0);
  expect(Math.abs(dockBox.y - reportScroll.top)).toBeLessThan(2);
});

test('master chevron expands and collapses every row group without requesting new data', async ({ page, overrideApi }) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await openPivot(page);
  await expandPivotConfiguration(page);
  await moveByMenu(page, 'Project', 'Rows');
  await collapsePivotConfiguration(page);

  const matrix = page.getByRole('region', { name: 'Scrollable pivot table' });
  const requestCount = pivotRequests(overrideApi.requests).length;
  const matrixBodyRows = matrix.locator(':scope > table > tbody > tr');
  const initialRowCount = await matrixBodyRows.count();
  const collapseAll = page.getByRole('button', { name: 'Collapse all groups' });
  await expect(collapseAll).toHaveAttribute('aria-expanded', 'true');
  await collapseAll.evaluate((button) => button.setAttribute('data-e2e-stable', 'master-toggle'));

  await collapseAll.click();
  const expandAll = page.getByRole('button', { name: 'Expand all groups' });
  await expect(expandAll).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => matrixBodyRows.count()).toBeLessThan(initialRowCount);
  expect(pivotRequests(overrideApi.requests)).toHaveLength(requestCount);

  await expandAll.click();
  await expect(page.getByRole('button', { name: 'Collapse all groups' })).toHaveAttribute(
    'data-e2e-stable',
    'master-toggle'
  );
  await expect(matrixBodyRows).toHaveCount(initialRowCount);
  expect(pivotRequests(overrideApi.requests)).toHaveLength(requestCount);
});

test('complete month axis export opens the report-style bottom bar and downloads the accepted seven-month table', async ({
  page,
  overrideApi,
}) => {
  test.slow();
  await page.setViewportSize({ height: 900, width: 1280 });
  await openPivot(page, pivotExportUrl);

  const download = page.getByRole('button', { name: 'Download', exact: true });
  const actions = page.getByTestId('report-export-actions');
  const matrix = page.getByRole('region', { name: 'Scrollable pivot table' });
  const grandTotalDock = page.getByTestId('pivot-grand-total-dock');
  const xlsx = page.getByRole('button', { name: 'XLS', exact: true });
  const csv = page.getByRole('button', { name: 'CSV', exact: true });
  const options = page.getByRole('region', { name: 'Pivot table download options' });
  const assertBottomBar = async (): Promise<void> => {
    await expect(options).toBeVisible();
    await expect(download).toHaveAttribute('aria-expanded', 'true');
    expect(await actions.locator(':scope > *').allTextContents()).toEqual([
      'Download report in selected format:',
      'XLS',
      'CSV',
    ]);
    expect(await actions.evaluate((element) => element.parentElement?.id)).toBe('pivot-export-options');
    await expect(options.locator('..')).toHaveCSS('position', 'fixed');
    for (const button of [xlsx, csv]) {
      await expect(button).toHaveClass(/_root_/);
      await expect(button).toHaveClass(/_size-medium_/);
      await expect(button).toHaveClass(/_contained_/);
      await expect(button).toHaveClass(/_button_/);
    }
  };
  const assertDockAboveBar = async (): Promise<void> => {
    await scrollReportPastMatrixHeader(matrix);
    await expect(grandTotalDock).toHaveAttribute('data-docked', 'true');
    const [dockBox, snackbarBox] = await Promise.all([boundingBox(grandTotalDock), boundingBox(options.locator('..'))]);
    expect(dockBox.y + dockBox.height).toBeLessThanOrEqual(snackbarBox.y + 1);
  };
  const assertLastRowAboveBar = async (): Promise<void> => {
    await scrollReportToGrandTotalHandoff(matrix);
    await expect(grandTotalDock).toHaveAttribute('data-docked', 'false');
    const [lastRowBox, snackbarBox] = await Promise.all([
      boundingBox(matrix.locator('tbody tr').last()),
      boundingBox(options.locator('..')),
    ]);
    expect(lastRowBox.y + lastRowBox.height).toBeLessThanOrEqual(snackbarBox.y + 1);
  };

  await expect(actions).toHaveCount(0);
  await expect(download).toHaveAttribute('aria-expanded', 'false');
  await expect(download).toHaveAttribute('aria-controls', 'pivot-export-options');
  expect((await boundingBox(download)).height).toBe(32);

  await download.click();
  await assertBottomBar();
  await assertDockAboveBar();
  await assertLastRowAboveBar();

  await page.getByRole('button', { name: 'Close download options' }).click();
  await expect(options).toHaveCount(0);
  await expect(download).toBeFocused();
  await expect(download).toHaveAttribute('aria-expanded', 'false');

  await download.click();
  await assertBottomBar();
  await download.click();
  await expect(options).toHaveCount(0);
  await expect(download).toHaveAttribute('aria-expanded', 'false');

  await download.click();
  await page.keyboard.press('Escape');
  await expect(options).toHaveCount(0);
  await expect(download).toBeFocused();

  await download.click();
  await page.setViewportSize({ height: 844, width: 767 });
  await assertBottomBar();
  await assertDockAboveBar();
  await assertLastRowAboveBar();
  await page.setViewportSize({ height: 900, width: 1280 });

  await expandPivotConfiguration(page);
  await moveByMenu(page, 'Average duration', 'Values');
  await moveByMenu(page, 'Entry count', 'Values');
  await moveByMenu(page, 'Entry type', 'Filters');
  const filterTrigger = page.getByRole('button', { name: 'Configure filter for Entry type' });
  const [filterChipBox, filterTriggerBox] = await Promise.all([
    boundingBox(filterTrigger.locator('..')),
    boundingBox(filterTrigger),
  ]);
  expect(filterChipBox.height).toBe(40);
  expect(filterTriggerBox.height).toBe(32);
  expect(Math.abs(filterTriggerBox.y - filterChipBox.y - 4)).toBeLessThanOrEqual(1);
  expect(
    Math.abs(filterChipBox.y + filterChipBox.height - filterTriggerBox.y - filterTriggerBox.height - 4)
  ).toBeLessThanOrEqual(1);
  await filterTrigger.click();
  const filterDialog = page.getByRole('dialog', { name: 'Filter: Entry type' });
  await filterDialog.getByRole('checkbox', { name: 'Note' }).click();
  await filterDialog.getByRole('button', { name: 'Apply' }).click();
  await expect
    .poll(() => pivotRequests(overrideApi.requests).at(-1)?.filters)
    .toEqual([{ key: 'EntryTypeKey', includedValues: ['Worklog'] }]);

  let releaseRefresh = (): void => undefined;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let deferredRefreshSeen = false;
  const queryPattern = `**/api${pivotPath}*`;
  const deferRefresh = async (route: Parameters<Parameters<Page['route']>[1]>[0]): Promise<void> => {
    deferredRefreshSeen = true;
    await refreshGate;
    await route.fallback();
  };
  await page.route(queryPattern, deferRefresh);
  await moveByMenu(page, 'Project', 'Rows');
  await collapsePivotConfiguration(page);
  await expect.poll(() => deferredRefreshSeen).toBe(true);
  await expect(download).toBeDisabled();
  await expect(xlsx).toBeDisabled();
  await expect(csv).toBeDisabled();
  const exportCountWhileRefreshing = overrideApi.pivotExports.length;
  await csv.click({ force: true });
  await xlsx.click({ force: true });
  expect(overrideApi.pivotExports).toHaveLength(exportCountWhileRefreshing);
  releaseRefresh();
  await expectLatestRows(overrideApi.requests, ['UserKey', 'ProjectKey']);
  await expect(csv).toBeEnabled();
  await page.unroute(queryPattern, deferRefresh);

  const acceptedQuery = pivotRequests(overrideApi.requests).at(-1) as PivotRequest;
  const csvDownload = page.waitForEvent('download');
  await csv.click();
  const downloadedCsv = await csvDownload;
  expect(downloadedCsv.suggestedFilename()).toBe('pivot_table_2026-02-01_2026-08-20.csv');
  const csvBytes = await downloadedBytes(await downloadedCsv.path());
  expect(csvBytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  const csvPayload = csvBytes.subarray(3).toString('utf8');
  expect(csvPayload.match(/\r\n/g)).toHaveLength(5);
  expect(csvPayload.endsWith('\r\n')).toBe(true);
  expect(csvPayload.replace(/\r\n/g, '')).not.toContain('\n');
  const exportedMonths = ['February', 'March', 'April', 'May', 'June', 'July', 'August'].map(
    (month) => `${month} 2026`
  );
  const measures = ['Total duration', 'Average duration', 'Entry count'];
  const emptyFirstQuarter = Array.from({ length: 9 }, () => '');
  expect(parseCsvTable(csvBytes.toString('utf8').replace(/^\uFEFF/, ''))).toEqual([
    [
      'User',
      'Project',
      ...exportedMonths.flatMap((month) => measures.map((measure) => `${month} / ${measure}`)),
      ...measures.map((measure) => `Grand total / ${measure}`),
    ],
    [
      'Unknown user',
      'Patient Portal',
      ...emptyFirstQuarter,
      '05:00',
      '02:30',
      '2',
      '01:00',
      '',
      '1',
      '02:00',
      '02:00',
      '1',
      '03:00',
      '03:00',
      '1',
      '11:00',
      '02:12',
      '5',
    ],
    [
      'Unknown user',
      'Design System',
      ...emptyFirstQuarter,
      '01:00',
      '01:00',
      '1',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '01:00',
      '01:00',
      '1',
    ],
    [
      'Unknown user',
      'Subtotal',
      ...emptyFirstQuarter,
      '06:00',
      '02:00',
      '3',
      '01:00',
      '01:00',
      '1',
      '02:00',
      '02:00',
      '1',
      '03:00',
      '03:00',
      '1',
      '12:00',
      '02:00',
      '6',
    ],
    [
      'Grand total',
      '',
      ...emptyFirstQuarter,
      '06:00',
      '02:00',
      '3',
      '01:00',
      '01:00',
      '1',
      '02:00',
      '02:00',
      '1',
      '03:00',
      '03:00',
      '1',
      '12:00',
      '02:00',
      '6',
    ],
  ]);

  expect(overrideApi.pivotExports).toHaveLength(1);
  const csvRequest = overrideApi.pivotExports[0];
  expect(csvRequest.pathname).toBe(pivotExportPath);
  expect(csvRequest.searchParams.get('format')).toBe('csv');
  expect(csvRequest.searchParams.getAll('projectId')).toEqual(['source-project', 'pm-project']);
  expect(csvRequest.searchParams.getAll('userId')).toEqual(['fixture-actor', 'fixture-author']);
  expect(csvRequest.searchParams.getAll('clientId')).toEqual(['source-client']);
  expect(csvRequest.searchParams.get('dateFrom')).toBe('2026-02-01');
  expect(csvRequest.searchParams.get('dateTo')).toBe('2026-08-20');
  const csvBody = exportedBody(csvRequest.body);
  expect(csvBody.query).toEqual(acceptedQuery);
  expect(csvBody.projection).toEqual({ effectiveDateTo: '2026-08-20' });
  expect(JSON.stringify(csvBody)).not.toContain('filterMembers');
  const memberIdentities = csvBody.presentation.memberLabels.map(({ key, value }) => JSON.stringify([key, value]));
  expect(new Set(memberIdentities).size).toBe(memberIdentities.length);
  expect(new Set(csvBody.presentation.memberLabels.map(({ key }) => key))).toEqual(
    new Set(['UserKey', 'ProjectKey', 'MonthYearKey'])
  );
  expect(memberIdentities).toContain(JSON.stringify(['UserKey', '11111111-1111-4111-8111-111111111111']));
  expect(memberIdentities).toContain(JSON.stringify(['ProjectKey', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']));
  exportedMonths.forEach((label, index) => {
    const value = `2026-${String(index + 2).padStart(2, '0')}`;
    expect(csvBody.presentation.memberLabels).toContainEqual({ key: 'MonthYearKey', label, value });
  });
  expect(csvBody.presentation.memberLabels.some(({ key }) => key === 'EntryTypeKey')).toBe(false);

  const beforeCollapse = overrideApi.pivotExports.length;
  const queryCountBeforeCollapse = pivotRequests(overrideApi.requests).length;
  const collapse = page.getByRole('button', { name: /^Collapse / }).first();
  await expect(collapse).toBeVisible();
  await collapse.click();
  expect(overrideApi.pivotExports).toHaveLength(beforeCollapse);
  expect(pivotRequests(overrideApi.requests)).toHaveLength(queryCountBeforeCollapse);
  const xlsxDownload = page.waitForEvent('download');
  await xlsx.click();
  const downloadedXlsx = await xlsxDownload;
  expect(downloadedXlsx.suggestedFilename()).toBe('pivot_table_2026-02-01_2026-08-20.xlsx');
  const workbook = await parsePivotExportWorkbook(await downloadedBytes(await downloadedXlsx.path()));
  expect(workbook.sheetName).toBe('Pivot');
  expect(workbook.sheetPath).toBe('xl/worksheets/sheet1.xml');
  expect(workbook.merges.sort()).toEqual([
    'A1:A2',
    'B1:B2',
    'C1:E1',
    'F1:H1',
    'I1:K1',
    'L1:N1',
    'O1:Q1',
    'R1:T1',
    'U1:W1',
    'X1:Z1',
  ]);
  expect(workbook.pane).toEqual({ state: 'frozen', topLeftCell: 'C3', xSplit: 2, ySplit: 2 });
  ['C', 'F', 'I', 'L', 'O', 'R', 'U'].forEach((column, index) => {
    expect(workbook.cells.get(`${column}1`)?.value).toBe(exportedMonths[index]);
  });
  expect(workbook.cells.get('X1')?.value).toBe('Grand total');
  expect(workbook.cells.get('A3')?.value).toBe('Unknown user');
  expect(workbook.cells.get('B5')?.value).toBe('Subtotal');
  expect(workbook.cells.get('A6')?.value).toBe('Grand total');
  expect(workbook.cells.get('B6')?.type).toBe('blank');
  ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].forEach((column) => {
    expect(workbook.cells.get(`${column}3`)).toMatchObject({ type: 'blank', value: null });
  });
  expect(workbook.cells.get('C3')?.numberFormat).toBe('[h]:mm');
  expect(workbook.cells.get('L3')).toMatchObject({ numberFormat: '[h]:mm', type: 'number' });
  expect(workbook.cells.get('L3')?.value as number).toBeCloseTo(300 / 1440, 12);
  expect(workbook.cells.get('N3')).toMatchObject({ numberFormat: '0', type: 'number', value: 2 });
  expect(workbook.cells.get('P3')).toMatchObject({ numberFormat: '[h]:mm', type: 'blank', value: null });
  expect(workbook.cells.get('N5')).toMatchObject({ numberFormat: '0', type: 'number', value: 3 });
  expect(workbook.cells.get('Z6')).toMatchObject({ numberFormat: '0', type: 'number', value: 6 });
  expect(overrideApi.pivotExports).toHaveLength(2);
  const xlsxRequest = overrideApi.pivotExports[1];
  expect(xlsxRequest.searchParams.get('format')).toBe('xlsx');
  expect(exportedBody(xlsxRequest.body)).toEqual(csvBody);

  overrideApi.makeNextPivotExportEmpty();
  const noDownload = page.waitForEvent('download', { timeout: 1000 }).then(
    () => false,
    () => true
  );
  await csv.click();
  await expect(page.getByText('No data is available to export')).toBeVisible();
  expect(await noDownload).toBe(true);
  expect(overrideApi.pivotExports).toHaveLength(3);
});
