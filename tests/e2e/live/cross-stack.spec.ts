import { expect, test } from '@playwright/test';
import { assertOAuthClientTargetedSelection } from './oauthClientTargetGuard';
import { live } from './liveFlows';
import { runLiveOAuthClientLifecycle } from './oauthClientLifecycle';

test('OAuth client @live @oauth-client completes the disposable OAuth client secret token expiry renewal and revoke lifecycle', async () => {
  test.slow();
  const targeted = assertOAuthClientTargetedSelection();
  test.skip(!targeted, 'Run through the guarded OAuth client live target wrapper');

  const evidence = await runLiveOAuthClientLifecycle();
  expect(evidence).toEqual({
    initialTokenAccepted: true,
    oldSecretRejectedAfterRotation: true,
    issuedTokenAcceptedAfterRotation: true,
    revokedSecretAndTokenRejected: true,
    expiryRejectedSecretAndToken: true,
    renewedTokenAccepted: true,
    cleanupVerified: true,
  });
});

test('Worklog overrides @live preserves source across two authors and stepwise removal', async ({
  page,
  browser,
  baseURL,
}) => {
  test.slow();
  const secondManagerContext = await browser.newContext({ baseURL, locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
  try {
    await live.login(page, 'owner');
    const secondManagerPage = await secondManagerContext.newPage();
    await live.login(secondManagerPage, 'manager');
    const result = await live.applyWorkUnitOverride(page, secondManagerPage);

    expect(result.sourceAfter).toEqual(result.sourceBefore);
    expect(result.firstOverride.effectiveTaskId).toBe('CT-565-OVERRIDE');
    expect(result.override.override.active).toBe(true);
    expect(result.override.effectiveProjectClient).toMatchObject({
      clientId: result.target.targetClientId,
      clientName: result.target.targetClientName,
      projectId: result.target.targetProjectId,
      projectName: result.target.targetProjectName,
    });
    expect(result.override.effectiveTaskId).toBe('CT-565-SECOND-MANAGER');
    expect(result.restoredPrevious.effectiveTaskId).toBe('CT-565-OVERRIDE');
    expect(result.restored.override.active).toBe(false);
    expect(result.restored.override.hasHistory).toBe(true);
  } finally {
    await secondManagerContext.close();
  }
});

test('CT-535 @live binds a pivot query and CSV export to the owned worklog', async ({ page }) => {
  test.slow();
  await live.login(page, 'owner');
  const evidence = await live.verifyPivotQueryAndExport(page);

  expect(evidence.cellCount).toBeGreaterThan(0);
  expect(evidence.csvRows).toBeGreaterThan(1);
  expect(evidence.csvColumns).toBeGreaterThan(1);
  expect(evidence.filename).toMatch(/^pivot_table_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
});

test('CT-415 @live preserves precise hours in CSV and XLS exports', async ({ page }) => {
  await live.login(page, 'owner');
  const files = await live.downloadPreciseExports(page);
  const preciseHours = 7 + 59 / 60 + 36 / 3600;
  expect(await live.readReportedHours(files.csv)).toBeCloseTo(preciseHours, 12);
  expect(await live.readReportedHours(files.xlsx)).toBeCloseTo(preciseHours, 12);
});

test('CT-437 @live accepts a report filter URI longer than 2048 characters', async ({ page }) => {
  await live.login(page, 'owner');
  const response = await live.openLongFilterReport(page);
  expect(response.request().url().length).toBeGreaterThan(2048);
  expect(response.ok()).toBe(true);
});

test('CT-439 CT-440 CT-456 @live shows archived historical user data', async ({ page }) => {
  await live.login(page, 'owner');
  const row = await live.openProvisionedReport(page);
  await expect(row).toContainText(live.manifest.archivedUserName, { timeout: 15_000 });
  await expect(row).toContainText(live.manifest.historicalDescription, { timeout: 15_000 });
});

test('CT-441 @live allows Owner and Manager user details but rejects Employee', async ({ browser }) => {
  await live.expectUserDetailsAccess(browser, 'owner', 200);
  await live.expectUserDetailsAccess(browser, 'manager', 200);
  await live.expectUserDetailsAccess(browser, 'employee', [403, 404]);
});

test('CT-450 CT-501 @live assigns a person and preserves the project name while editing description', async ({
  page,
}) => {
  await live.login(page, 'owner');
  const before = await live.readProject(page);
  const after = await live.assignPersonAndEditDescription(page);
  expect(after.name).toBe(before.name);
  expect(after.description).toBe(live.manifest.updatedDescription);
  expect(after.userIds).toContain(live.manifest.userId);
});

test('CT-528 CT-514 @live replays one work-unit mutation with the same idempotency key', async ({ page }) => {
  await live.login(page, 'user');
  const result = await live.submitWithLostResponseAndRetry(page);
  expect(result.keys).toHaveLength(2);
  expect(result.keys[0]).toBe(result.keys[1]);
  expect(result.reportedRows).toHaveLength(1);
});
