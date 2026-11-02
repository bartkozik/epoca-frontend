import { expect, ids, reportUrl, test, type FixtureRole } from './fixtures/workUnitOverridesApi';

test('manager cannot delete another employee worklog', async ({ page, overrideApi }) => {
  await page.goto(reportUrl);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Edit report entry', exact: true })
      .getByRole('button', { name: 'Delete', exact: true }),
  ).toHaveCount(0);
  expect(overrideApi.requests.filter(({ method }) => method === 'DELETE')).toEqual([]);
});

test.describe('Owner ordinary worklog deletion', () => {
  test.use({ role: 'Owner' });

  test('keeps standard Delete separate from history-card undo', async ({ page, overrideApi }) => {
    await page.goto(reportUrl);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit report entry', exact: true });
    await dialog.getByRole('button', { name: 'Correction history', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Remove correction', exact: true })).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    const confirmation = page.getByRole('dialog').filter({ hasText: 'Are you sure you want to delete this report?' });
    await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Taylor Author' })).toHaveCount(0);
    expect(overrideApi.requests.filter(({ method }) => method === 'DELETE').map(({ pathname }) => pathname)).toEqual([
      '/organizations/overrides-e2e/work-units/00000030-0000-4000-8000-000000000001',
    ]);
  });
});

for (const role of ['Owner', 'Superadmin'] satisfies FixtureRole[]) {
  test.describe(`${role} source actions and overrides`, () => {
    test.use({ role });
    test('uses one standard form and guards unsaved source and assignment changes', async ({ page, overrideApi }) => {
      await page.goto(reportUrl);
      await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Edit report entry', exact: true });
      await expect(dialog.getByLabel('Task ID')).toHaveValue('CORRECTED-OLD');
      await dialog.getByLabel('Task ID').fill('UNSAVED-CORRECTION');
      await expect(dialog.getByRole('button', { name: 'Original entry', exact: true })).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: 'Correction and history', exact: true })).toHaveCount(0);
      await page.keyboard.press('Escape');
      const confirmation = page.getByRole('dialog').filter({ hasText: 'Discard unsaved changes?' });
      await expect(confirmation).toBeVisible();
      await confirmation.getByRole('button', { name: 'Discard changes' }).click();
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await expect(dialog.getByRole('button', { name: 'Update', exact: true })).toBeVisible();
      await expect(dialog.getByLabel('Task ID', { exact: true })).toHaveValue('CORRECTED-OLD');
      await dialog.getByLabel('Description of activities', { exact: true }).fill('UNSAVED-SOURCE');
      await page.keyboard.press('Escape');
      await expect(confirmation).toBeVisible();
      await confirmation.getByRole('button', { name: 'Discard changes' }).click();
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await dialog.getByLabel('Task ID').fill(`CORRECTED-${role}`);
      await dialog.getByRole('button', { name: 'Update', exact: true }).click();
      await expect(dialog.getByText('Correction saved.', { exact: true })).toBeVisible();
      expect(overrideApi.requests.filter(({ method }) => method === 'PATCH')).toEqual([]);
      expect(overrideApi.source.taskId).toBe('SOURCE-17');
    });

    test('saves ordinary fields and audited assignments together without overwriting the original assignment', async ({
      page,
      overrideApi,
    }) => {
      await page.goto(reportUrl);
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Edit report entry', exact: true });
      await dialog.getByLabel('Task ID', { exact: true }).fill('COMBINED-CHANGE');
      await dialog.getByLabel('Description of activities', { exact: true }).fill('Updated ordinary description');
      await dialog.getByRole('button', { name: 'Update', exact: true }).click();
      await expect.poll(() => overrideApi.source.description).toBe('Updated ordinary description');
      await expect(dialog.getByRole('button', { name: 'Update', exact: true })).toBeDisabled();
      expect(overrideApi.source.taskId).toBe('SOURCE-17');
      expect(overrideApi.source.projectId).toBe(ids.sourceProject);
      expect(overrideApi.state).toMatchObject({
        revision: 42,
        version: 31,
        taskId: { mode: 'Set', value: 'COMBINED-CHANGE' },
      });
      expect(
        overrideApi.requests.filter(({ method }) => ['PUT', 'PATCH'].includes(method)).map(({ method }) => method),
      ).toEqual(['PUT', 'PATCH']);

      await dialog.getByLabel('Task ID', { exact: true }).fill('AFTER-SOURCE-SAVE');
      await dialog.getByRole('button', { name: 'Update', exact: true }).click();
      await expect.poll(() => overrideApi.state.revision).toBe(43);
      expect(overrideApi.requests.filter(({ method }) => method === 'PATCH')).toHaveLength(1);
      expect(overrideApi.requests.filter(({ method }) => method === 'PUT').at(-1)?.body).toMatchObject({
        expectedRevision: 42,
      });
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    });

    test('retains a description draft but adopts confirmed concurrent hours after an assignment conflict', async ({
      page,
      overrideApi,
    }) => {
      await page.goto(reportUrl);
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Edit report entry', exact: true });
      await dialog.getByLabel('Task ID', { exact: true }).fill('MY-ASSIGNMENT-DRAFT');
      await dialog.getByLabel('Description of activities', { exact: true }).fill('My description draft');
      overrideApi.source.duration = 'PT3H';
      overrideApi.makeNextWriteStale();
      await dialog.getByRole('button', { name: 'Update', exact: true }).click();
      await dialog.getByRole('button', { name: 'Use current values', exact: true }).click();
      await expect(dialog.getByLabel('Hours', { exact: true })).toHaveValue('03:00');
      await expect(dialog.getByLabel('Description of activities', { exact: true })).toHaveValue('My description draft');
      await dialog.getByRole('button', { name: 'Update', exact: true }).click();
      await expect.poll(() => overrideApi.source.description).toBe('My description draft');
      expect(overrideApi.source.duration).toBe('PT3H');
      expect(overrideApi.requests.filter(({ method }) => method === 'PATCH')).toHaveLength(1);
      expect(overrideApi.requests.filter(({ method }) => method === 'PUT')).toHaveLength(1);
    });
  });
}

test.describe('project owner scope', () => {
  test.use({ role: 'ProjectOwner' });
  test('limits correction targets while ordinary reports retain readable effective rows', async ({
    page,
    overrideApi,
  }) => {
    await page.goto(reportUrl);
    const outside = page.getByRole('row').filter({ hasText: 'Outside Scope Corrected Project' });
    await expect(outside).toBeVisible();
    await expect(outside.getByRole('button', { name: 'Edit', exact: true })).toBeDisabled();
    await page
      .getByRole('row')
      .filter({ hasText: 'CORRECTED-OLD' })
      .getByRole('button', { name: 'Edit', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Edit report entry', exact: true });
    await dialog.getByRole('button', { name: 'Client and project', exact: true }).click();
    await expect(dialog.getByText('Outside Scope Corrected Project', { exact: true })).toHaveCount(0);
    await dialog.getByText('Alternate Project', { exact: true }).click();
    await dialog.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(dialog.getByText('Correction saved.', { exact: true })).toBeVisible();
    const forbidden = await page.evaluate(
      async ({ unitId, target }) => {
        const response = await fetch(`/api/organizations/overrides-e2e/work-units/${unitId}/override`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedRevision: 41, projectId: target, taskId: { mode: 'Inherit' } }),
        });
        return { status: response.status, body: (await response.json()) as unknown };
      },
      { unitId: ids.unit, target: ids.outsideTarget },
    );
    expect(forbidden.status).toBe(400);
    expect(forbidden.body).toMatchObject({ type: 'result:work-unit-override:project-unavailable' });
    expect(overrideApi.state.projectId).toBe(ids.alternateProject);
  });
});

test.describe('ordinary employee', () => {
  test.use({ role: 'Employee' });
  test('sees effective report and export values but edits only source without privileged reads', async ({
    page,
    overrideApi,
  }) => {
    await page.goto(reportUrl);
    const row = page.getByRole('row').filter({ hasText: 'CORRECTED-OLD' });
    await expect(row.locator('[data-th="Client"]')).toHaveText('Corrected Client');
    await row.getByRole('checkbox').locator('xpath=following-sibling::span').click({ force: true });
    await page.getByRole('button', { name: 'CSV', exact: true }).click();
    await expect.poll(() => overrideApi.exports.length).toBe(1);
    await page.getByRole('button', { name: 'Corrected', exact: true }).hover();
    await expect(page.getByRole('tooltip')).toContainText('This worklog has a report correction.');
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit report entry', exact: true });
    await expect(dialog.getByRole('button', { name: 'Correction and history', exact: true })).toHaveCount(0);
    await expect(dialog.getByLabel('Task ID', { exact: true })).toHaveValue('SOURCE-17');
    await dialog.getByLabel('Description of activities', { exact: true }).fill('Employee source edit');
    await dialog.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(overrideApi.source.description).toBe('Employee source edit');
    expect(overrideApi.state).toMatchObject({
      revision: 41,
      version: 30,
      taskId: { mode: 'Set', value: 'CORRECTED-OLD' },
    });
    expect(overrideApi.requests.filter(({ pathname }) => /\/override(?:-history)?$/.test(pathname))).toEqual([]);
    expect(overrideApi.requests.filter(({ method }) => method === 'PATCH')).toHaveLength(1);
  });
});

test.describe('read only correction history', () => {
  test.use({ access: 'readOnly' });
  test('opens history without exposing write controls', async ({ page, overrideApi }) => {
    await page.goto(reportUrl);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit report entry', exact: true });
    await expect(dialog.getByRole('button', { name: 'Correction history', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Update', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Remove correction', exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Correction history', exact: true }).click();
    await expect(dialog.getByRole('region', { name: 'Correction history' })).toContainText('Morgan Second Manager');
    expect(overrideApi.requests.filter(({ method }) => ['PUT', 'DELETE', 'PATCH'].includes(method))).toEqual([]);
  });
});

test.describe('no history capability', () => {
  test.use({ access: 'noHistory' });
  test('uses generic badge and does not fetch forbidden history', async ({ page, overrideApi }) => {
    await page.goto(reportUrl);
    await page.getByRole('button', { name: 'Corrected', exact: true }).hover();
    await expect(page.getByRole('tooltip')).toContainText('This worklog has a report correction.');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit report entry', exact: true });
    await expect(dialog.getByLabel('Task ID')).toHaveValue('CORRECTED-OLD');
    await expect(dialog.getByRole('button', { name: 'Correction history', exact: true })).toHaveCount(0);
    expect(overrideApi.historyRequests).toEqual([]);
  });
});
