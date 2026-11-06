import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { expect, test } from '../fixtures/epocaTest';
import { IDS } from '../worlds/ids';

const WORK_UNITS_PATH = '/organizations/epoca-e2e/work-units';
const EXPORT_PATH = `${WORK_UNITS_PATH}/export`;

const expectDateFields = async (page: Page, from: string, to: string): Promise<void> => {
  await expect
    .poll(() =>
      page.getByRole('textbox').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)),
    )
    .toEqual(expect.arrayContaining([from, to]));
};

test.use({ world: 'world-4', actor: 'owner' });

test('CT-439 CT-440 CT-456 @mr shows archived users and their historical hours', async ({ page }) => {
  await page.goto('/report?startDate=2026-07-01&endDate=2026-07-31');

  const historicalRow = page.getByRole('row', { name: /Historyczne godziny/ });
  await expect(historicalRow.getByText('Archived User', { exact: true })).toBeVisible();
  await expect(historicalRow.getByText('Historyczne godziny', { exact: true })).toBeVisible();
});

test('CT-579 @mr defaults and resets to whole months when navigating report periods', async ({ page, runtime }) => {
  await page.goto('/report');
  await expectDateFields(page, 'Od: 01.07.2026', 'Do: 31.07.2026');
  await expect(page.getByRole('button', { name: 'Resetuj' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Poprzedni okres' }).click();
  await expect(page).toHaveURL(/startDate=2026-06-01.*endDate=2026-06-30/);
  await expectDateFields(page, 'Od: 01.06.2026', 'Do: 30.06.2026');

  await page.getByRole('button', { name: 'Następny okres' }).click();
  await expectDateFields(page, 'Od: 01.07.2026', 'Do: 31.07.2026');
  await page.getByRole('button', { name: 'Następny okres' }).click();
  await expectDateFields(page, 'Od: 01.08.2026', 'Do: 31.08.2026');

  await page.getByRole('button', { name: 'Resetuj' }).click();
  await expectDateFields(page, 'Od: 01.07.2026', 'Do: 31.07.2026');
  await page.getByRole('button', { name: 'Poprzedni okres' }).click();
  await expectDateFields(page, 'Od: 01.06.2026', 'Do: 30.06.2026');
  await expect
    .poll(() => runtime.journal.last('GET', WORK_UNITS_PATH)?.query)
    .toMatchObject({ dateFrom: ['2026-06-01'], dateTo: ['2026-06-30'] });

  await page.goto('/report?startDate=2026-07-01&navigationMode=fixed-length');
  await expectDateFields(page, 'Od: 01.07.2026', 'Do: 15.07.2026');
  await expect(page).toHaveURL(/navigationMode=fixed-length/);
  await page.reload();
  await expectDateFields(page, 'Od: 01.07.2026', 'Do: 15.07.2026');
  await expect
    .poll(() => runtime.journal.last('GET', WORK_UNITS_PATH)?.query)
    .toMatchObject({ dateFrom: ['2026-07-01'], dateTo: ['2026-07-15'] });
});

test('CT-517 @mr keeps date fields URL request and Back Forward synchronized', async ({ page, runtime }) => {
  const workUnitsBeforeReads = structuredClone(runtime.state.workUnits);
  await page.goto('/report?startDate=2026-06-01&endDate=2026-06-30');
  await expectDateFields(page, 'Od: 01.06.2026', 'Do: 30.06.2026');

  await page.goto('/report?startDate=2026-07-01&endDate=2026-07-31');
  await expectDateFields(page, 'Od: 01.07.2026', 'Do: 31.07.2026');

  await page.getByRole('button', { name: 'Następny okres' }).click();
  await expect(page).toHaveURL(/startDate=2026-08-01.*endDate=2026-08-31/);
  await expectDateFields(page, 'Od: 01.08.2026', 'Do: 31.08.2026');
  await expect(page.getByText('Precyzyjne godziny', { exact: true })).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/startDate=2026-06-01.*endDate=2026-06-30/);
  await expectDateFields(page, 'Od: 01.06.2026', 'Do: 30.06.2026');

  await page.goForward();
  await expect(page).toHaveURL(/startDate=2026-08-01.*endDate=2026-08-31/);
  await expectDateFields(page, 'Od: 01.08.2026', 'Do: 31.08.2026');

  await expect
    .poll(() => runtime.journal.last('GET', WORK_UNITS_PATH)?.query)
    .toMatchObject({ dateFrom: ['2026-08-01'], dateTo: ['2026-08-31'] });
  expect(runtime.state.workUnits).toEqual(workUnitsBeforeReads);
});

test('CT-415 @mr requests precise CSV and XLS exports without rounding UI data', async ({ page, runtime }) => {
  await page.goto('/report?startDate=2026-07-01&endDate=2026-07-31');

  const preciseRow = page.getByRole('row', { name: /Precyzyjne godziny/ });
  const preciseCheckbox = preciseRow.getByRole('checkbox', { name: 'Zaznacz wpis 15.07.2026, Regular User' });
  const checkboxBox = await preciseCheckbox.boundingBox();
  expect(checkboxBox).not.toBeNull();
  if (!checkboxBox) throw new Error('Report checkbox must expose a real hit target');
  expect(checkboxBox.width).toBe(24);
  expect(checkboxBox.height).toBe(24);
  await preciseCheckbox.check();
  await expect(preciseCheckbox).toBeChecked();
  await expect(preciseRow.getByText('08:00', { exact: true })).toBeVisible();
  await expect(page.getByText('7:59', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Zaznaczono 1 wpis · 08:00', { exact: true })).toBeVisible();
  await expect(page.getByText('Eksportuj zaznaczone:', { exact: true })).toBeVisible();

  const [csvDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'CSV', exact: true }).click(),
  ]);
  const [xlsxDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'XLS', exact: true }).click(),
  ]);

  expect(csvDownload.suggestedFilename()).toBe('reported_hours_2026-07.csv');
  expect(xlsxDownload.suggestedFilename()).toBe('reported_hours_2026-07.xlsx');

  const csvPath = await csvDownload.path();
  const xlsxPath = await xlsxDownload.path();
  expect(csvPath).not.toBeNull();
  expect(xlsxPath).not.toBeNull();
  if (!csvPath || !xlsxPath) throw new Error('Playwright downloads must expose local paths');
  const [csvBytes, xlsxBytes] = await Promise.all([readFile(csvPath), readFile(xlsxPath)]);
  expect(csvBytes.toString('utf8')).toBe('reportedHours\n7.993333333333333\n');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsxBytes);
  expect(workbook.worksheets).toHaveLength(1);
  const worksheet = workbook.getWorksheet('Report');
  expect(worksheet).toBeDefined();
  expect(worksheet?.actualRowCount).toBe(2);
  expect(worksheet?.actualColumnCount).toBe(1);
  expect(worksheet?.getCell('A1').value).toBe('reportedHours');
  expect(worksheet?.getCell('A2').type).toBe(ExcelJS.ValueType.Number);
  expect(worksheet?.getCell('A2').value).toBe(7.993333333333333);

  await expect.poll(() => runtime.journal.entries.filter(({ path }) => path === EXPORT_PATH).length).toBe(2);
  const exports = runtime.journal.entries.filter(({ path }) => path === EXPORT_PATH);
  expect(exports.map(({ query }) => query)).toEqual([{ format: ['csv'] }, { format: ['xlsx'] }]);
  expect(exports.map(({ responseStatus }) => responseStatus)).toEqual([200, 200]);
  expect(exports.map(({ responseHeaders }) => responseHeaders)).toEqual([
    {
      'content-disposition': 'attachment; filename="reported_hours_2026-07.csv"',
      'content-type': 'text/csv',
    },
    {
      'content-disposition': 'attachment; filename="reported_hours_2026-07.xlsx"',
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  ]);
  const preciseUnit = runtime.state.workUnits.find(({ description }) => description === 'Precyzyjne godziny');
  const expectedExportBody = {
    clientIds: [],
    columnNames: {
      clientName: 'Klient',
      createdAt: 'Utworzono',
      date: 'Data',
      description: 'Opis',
      duration: 'Zgłoszone godziny',
      entryType: 'Typ',
      modifiedAt: 'Zmodyfikowano',
      projectName: 'Projekt',
      taskId: 'ID zadania',
      userFullName: 'Użytkownik',
    },
    ids: [preciseUnit?.id],
    projectIds: [],
    userIds: [],
  };
  expect(exports.map(({ requestBody }) => requestBody)).toEqual([expectedExportBody, expectedExportBody]);
});

test('@mr lists worklogs with a header selection, the Hours total and icon-only row actions', async ({ page }) => {
  await page.goto('/report?startDate=2026-07-01&endDate=2026-07-31');

  const headerRow = page.getByRole('row', { name: /^Zaznacz wszystkie wpisy do eksportu/ });
  await expect(headerRow.getByRole('cell')).toHaveText(
    ['', 'Data', 'Klient', 'Projekt', 'Użytkownik', 'Opis działalności', 'ID zadania', /^Godziny\s*08:30$/, ''],
    { useInnerText: true },
  );
  await expect(page.getByText('2 wpisy', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Wszystkie', exact: true })).toHaveCount(0);

  const preciseRow = page.getByRole('row', { name: /Precyzyjne godziny/ });
  for (const action of ['Edytuj', 'Usuń']) {
    const button = preciseRow.getByRole('button', { name: action, exact: true });
    await expect(button).toHaveAttribute('title', action);
    await expect(button).toHaveText('');
  }

  const selectAll = page.getByRole('checkbox', { name: 'Zaznacz wszystkie wpisy do eksportu', exact: true });
  await selectAll.check();
  const rowCheckboxes = page.getByRole('checkbox', { name: /^Zaznacz wpis / });
  await expect(rowCheckboxes).toHaveCount(2);
  for (const checkbox of await rowCheckboxes.all()) await expect(checkbox).toBeChecked();
  await expect(page.getByText('Zaznaczono 2 wpisy · 08:30', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Wyczyść zaznaczenie', exact: true }).click();
  await expect(page.getByText(/^Zaznaczono /)).toHaveCount(0);
  await expect(selectAll).not.toBeChecked();
});

test('@mr summarizes active filters in removable chips and keeps rows visible while the report refreshes', async ({
  page,
  runtime,
}) => {
  await page.goto(
    `/report?startDate=2026-07-01&endDate=2026-07-31&projects=${IDS.projectAlpha}&users=${IDS.user}&isContextualFiltering=true`,
  );

  await expect(page.getByText('Projekt: Alpha Project', { exact: true })).toBeVisible();
  await expect(page.getByText('Użytkownik: Regular User', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Usuń filtr: projekt', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Usuń filtr: użytkownik', exact: true })).toBeVisible();
  await expect(page.getByText('1 wpis', { exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.has('isContextualFiltering')).toBe(false);
  await expect(page.getByText('Filtrowanie kontekstowe')).toHaveCount(0);

  let releaseReport: () => void = () => undefined;
  const reportReleased = new Promise<void>((resolve) => {
    releaseReport = resolve;
  });
  await page.route(
    (url) => url.pathname === `/__e2e_api${WORK_UNITS_PATH}`,
    async (route) => {
      await reportReleased;
      await route.fallback();
    },
  );

  await page.getByRole('button', { name: 'Wyczyść wszystko', exact: true }).click();

  const results = page.getByTestId('report-results');
  await expect(page.getByRole('button', { name: /^Usuń filtr:/ })).toHaveCount(0);
  await expect(results).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText('Odświeżanie…', { exact: true })).toBeVisible();
  await expect(results.getByRole('row', { name: /Precyzyjne godziny/ })).toBeVisible();
  await expect(results.getByRole('row', { name: /Historyczne godziny/ })).toHaveCount(0);

  releaseReport();
  await expect(results).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByText('Odświeżanie…', { exact: true })).toHaveCount(0);
  await expect(results.getByRole('row', { name: /Historyczne godziny/ })).toBeVisible();
  await expect(page.getByText('2 wpisy', { exact: true })).toBeVisible();
  const lastQuery = runtime.journal.last('GET', WORK_UNITS_PATH)?.query;
  expect(lastQuery).toMatchObject({ dateFrom: ['2026-07-01'], dateTo: ['2026-07-31'] });
  expect(lastQuery).not.toHaveProperty('projectId');
  expect(lastQuery).not.toHaveProperty('userId');
  expect([...new URL(page.url()).searchParams.keys()].sort()).toEqual(['endDate', 'startDate']);
});
