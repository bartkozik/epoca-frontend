import { chooseProject } from '../../workUnitOverrides/fixtures/workUnitEditHelpers';
import { expect, ids, reportUrl, test } from '../../workUnitOverrides/fixtures/workUnitOverridesApi';
import {
  fillLiveWorkUnitOverride,
  saveLiveWorkUnitOverride,
  undoLiveWorkUnitOverride,
} from '../live/workUnitOverrideUi';

test('Worklog corrections @mr changes effective client project and clears task while preserving source', async ({
  page,
  overrideApi,
}) => {
  await page.goto(`${reportUrl}&projects=${ids.targetProject}`);
  const source = { ...overrideApi.source };
  const row = page.getByRole('row').filter({ hasText: 'CORRECTED-OLD' });
  await row.getByRole('checkbox').locator('xpath=following-sibling::span').click({ force: true });
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit report entry', exact: true });
  await chooseProject(dialog, 'Alternate Client Project');
  await dialog.getByLabel('Task ID', { exact: true }).fill('');
  await dialog.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(dialog.getByText('Correction saved.', { exact: true })).toBeVisible();
  await expect(row).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Client and project', exact: true })).toContainText(
    'Alternate Client Project',
  );
  expect(overrideApi.source).toEqual(source);
  expect(overrideApi.requests.filter(({ method }) => method === 'PUT').map(({ body }) => body)).toEqual([
    { expectedRevision: 40, projectId: ids.alternateClientProject, taskId: { mode: 'Clear' } },
  ]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'CSV', exact: true })).toHaveCount(0);
  await page.goto(`${reportUrl}&projects=${ids.alternateClientProject}`);
  const corrected = page.getByRole('row').filter({ hasText: 'Alternate Client Project' });
  await expect(corrected.locator('[data-th="Client"]')).toHaveText('Alternate Client');
  await expect(corrected.locator('[data-th="Task ID"]')).toBeEmpty();
});

for (const language of ['en', 'pl'] as const) {
  test.describe(`live correction UI helpers in ${language}`, () => {
    test.use({ language, historyDepth: 0 });
    test('live helpers @mr support two authors and undo each correction to the source', async ({
      page,
      overrideApi,
    }) => {
      await page.goto(reportUrl);
      await page.getByRole('button', { name: /^(?:Edytuj|Edit)$/ }).click();
      const dialog = page.getByRole('dialog', { name: /^(?:Edycja wpisu w raporcie|Edit report entry)$/ });
      const endpoint = new URL(`/api/organizations/overrides-e2e/work-units/${ids.unit}/override`, page.url());
      await fillLiveWorkUnitOverride(dialog, 'Alternate Client Project', 'LIVE-A');
      expect((await saveLiveWorkUnitOverride(page, dialog, endpoint)).status()).toBe(200);
      await expect(dialog.getByLabel(/^(?:ID zadania|Task ID)$/)).toHaveValue('LIVE-A');
      overrideApi.makeNextWriteBySecondManager();
      await fillLiveWorkUnitOverride(dialog, 'Alternate Client Project', 'LIVE-B');
      expect((await saveLiveWorkUnitOverride(page, dialog, endpoint)).status()).toBe(200);
      await expect(dialog.getByLabel(/^(?:ID zadania|Task ID)$/)).toHaveValue('LIVE-B');
      expect((await undoLiveWorkUnitOverride(page, dialog, endpoint)).status()).toBe(200);
      await expect(dialog.getByLabel(/^(?:ID zadania|Task ID)$/)).toHaveValue('LIVE-A');
      expect((await undoLiveWorkUnitOverride(page, dialog, endpoint)).status()).toBe(200);
      await expect(dialog.getByLabel(/^(?:ID zadania|Task ID)$/)).toHaveValue('SOURCE-17');
      expect(overrideApi.state.active).toBe(false);
      expect(
        overrideApi.history.filter((entry) => entry.operation === 'Replace').map((entry) => entry.actor.id),
      ).toContain(ids.secondManager);
    });
  });
}
